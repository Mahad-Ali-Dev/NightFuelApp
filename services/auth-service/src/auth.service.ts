import { PrismaClient, User } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { RegisterBody, LoginBody, RefreshTokenBody } from './schemas';
import bcrypt from 'bcryptjs';
import { Channels } from '@nightfuel/types';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export class AuthService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: RedisEventBus,
        private config: { JWT_SECRET: string }
    ) { }

    async register(body: RegisterBody): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (existingUser) {
            throw new Error('User already exists');
        }

        const passwordHash = await bcrypt.hash(body.password, 12);

        const user = await this.prisma.user.create({
            data: {
                email: body.email,
                passwordHash,
                displayName: body.displayName,
                region: body.region,
                timezone: body.timezone ?? 'UTC',
                locale: body.locale ?? 'en-US',
                role: (body.role ?? 'USER') as any,
            },
        });

        // Publish user.registered — user-service subscribes to create UserProfile
        await this.eventBus.publish(Channels.Auth.UserRegistered, {
            eventId: randomUUID(),
            eventType: 'user.registered',
            producedAt: new Date().toISOString(),
            producerService: 'auth-service',
            correlationId: randomUUID(),
            userId: user.id,
            payload: {
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                timezone: user.timezone,
                region: user.region,
            },
        });

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        return { user, accessToken, refreshToken };
    }

    async login(body: LoginBody): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        const user = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        const validPassword = await bcrypt.compare(body.password, user.passwordHash);
        if (!validPassword) {
            throw new Error('Invalid credentials');
        }

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        return { user, accessToken, refreshToken };
    }

    async refreshToken(body: RefreshTokenBody): Promise<{ accessToken: string; refreshToken: string }> {
        const { refreshToken } = body;

        // Find token in DB
        const savedToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: refreshToken },
            include: { user: true },
        });

        if (!savedToken) {
            throw new Error('Invalid refresh token');
        }

        // Check if expired
        if (savedToken.expiresAt < new Date()) {
            // Delete expired token
            await this.prisma.refreshToken.delete({ where: { id: savedToken.id } });
            throw new Error('Refresh token expired');
        }

        // Rotate token: delete old one
        await this.prisma.refreshToken.delete({ where: { id: savedToken.id } });

        // Generate new tokens
        // Use the associated user to generate new tokens
        return this.generateTokens(savedToken.user, savedToken.deviceId);
    }

    async getUserProfile(userId: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id: userId },
        });
    }

    async logout(refreshToken: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash: refreshToken },
        });
    }

    private async generateTokens(user: User, deviceId: string) {
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role },
            this.config.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshTokenString = randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: refreshTokenString, // In prod, hash this too!
                deviceId,
                expiresAt,
            },
        });

        return { accessToken, refreshToken: refreshTokenString };
    }
}
