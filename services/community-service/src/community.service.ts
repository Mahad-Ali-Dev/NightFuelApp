import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';
import { AuthorResolver } from './author-resolver';

const logger = createLogger('community.service');

// Typed error so the route layer can map a self-follow attempt to a 400
// (vs. a generic 500). Carries a stable `code` for assertion in tests.
export class SelfFollowError extends Error {
    readonly code = 'self_follow';
    constructor() {
        super('You cannot follow yourself');
        this.name = 'SelfFollowError';
    }
}

// ── Level Progression Formula ─────────────────────────────────────────────────
// XP required to reach level N = 100 * N * (N - 1) / 2
// Level 1: 0 XP, Level 2: 100 XP, Level 3: 300 XP, Level 4: 600 XP …
export function xpToLevel(xp: number): number {
    if (xp <= 0) return 1;
    // Solve: 50 * n^2 - 50 * n <= xp  → n = floor((1 + sqrt(1 + 8*xp/100)) / 2)
    return Math.max(1, Math.floor((1 + Math.sqrt(1 + 8 * xp / 100)) / 2));
}

export function xpForNextLevel(currentLevel: number): number {
    return 100 * currentLevel * (currentLevel + 1) / 2;
}

// ── Badge Keys ────────────────────────────────────────────────────────────────
const BADGE_KEYS = {
    FIRST_POST: 'first_post',
    SOCIAL_BUTTERFLY: 'social_butterfly',
    CONVERSATIONALIST: 'conversationalist',
    CHALLENGE_STARTER: 'challenge_starter',
    CHALLENGE_CHAMPION: 'challenge_champion',
    POWER_USER: 'power_user',
    ON_FIRE: 'on_fire',
    ELITE: 'elite',
    NEWCOMER: 'newcomer',
    VETERAN: 'veteran',
    LEGEND: 'legend',
} as const;

export class CommunityService {
    constructor(
        private prisma: PrismaClient,
        private authorResolver?: AuthorResolver
    ) { }

    // ── Feed & Posts ──────────────────────────────────────────────────────────

    async getFeed(limit: number = 20, cursor?: string) {
        const posts = await this.prisma.post.findMany({
            take: limit,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { comments: true } },
            }
        });
        return this._withAuthors(posts);
    }

    async getPostById(postId: string) {
        const post = await this.prisma.post.findUnique({
            where: { id: postId },
            include: { _count: { select: { comments: true } } }
        });
        if (!post) return post;
        return this._withAuthor(post);
    }

    async createPost(authorId: string, content: string, imageUrl?: string) {
        const post = await this.prisma.post.create({
            data: { authorId, content, imageUrl }
        });

        // Check for first-post badge
        const postCount = await this.prisma.post.count({ where: { authorId } });
        if (postCount === 1) {
            await this._awardBadgeIfNew(authorId, BADGE_KEYS.FIRST_POST);
        }

        return post;
    }

    async updatePost(postId: string, authorId: string, content: string) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) throw new Error('Post not found');
        if (post.authorId !== authorId) throw new Error('Unauthorized');

        return this.prisma.post.update({
            where: { id: postId },
            data: { content }
        });
    }

    async deletePost(postId: string, authorId: string) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) return { success: true };
        if (post.authorId !== authorId) throw new Error('Unauthorized');

        await this.prisma.post.delete({ where: { id: postId } });
        return { success: true };
    }

    /**
     * Whether `viewerId` may see `authorId`'s protected content (their posts).
     * True for the author themselves, for a PUBLIC author, or for an accepted
     * follower of a PRIVATE author. Mirrors the follow-gate already enforced in
     * getUserDetailedProfile so the privacy contract ("a private profile is
     * visible only to accepted followers") protects the POSTS, not just the
     * profile header.
     */
    private async canViewUserContent(viewerId: string, authorId: string): Promise<boolean> {
        if (viewerId === authorId) return true;
        const author = this.authorResolver
            ? await this.authorResolver.resolveOne(authorId).catch((err) => {
                logger.warn({ err, authorId }, 'user-posts author resolve failed');
                return null;
            })
            : null;
        const isPrivate = author?.isPrivate ?? false;
        if (!isPrivate) return true;
        const edge = await this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
        });
        return !!edge;
    }

    async getUserPosts(viewerId: string, authorId: string, limit: number = 20) {
        // Privacy gate: a private author's posts are visible only to the author
        // and accepted followers. A blocked viewer gets an empty list (the
        // profile header already conveys the private state via the detailed
        // profile endpoint) — never the protected posts.
        if (!(await this.canViewUserContent(viewerId, authorId))) {
            return this._withAuthors([]);
        }
        const posts = await this.prisma.post.findMany({
            where: { authorId },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { comments: true } },
            }
        });
        return this._withAuthors(posts);
    }

    async likePost(postId: string, likerId?: string) {
        const post = await this.prisma.post.update({
            where: { id: postId },
            data: { likes: { increment: 1 } }
        });

        // Check social butterfly badge for post author
        if (post.authorId) {
            const totalLikes = await this.prisma.post.aggregate({
                where: { authorId: post.authorId },
                _sum: { likes: true },
            });
            const likes = totalLikes._sum.likes ?? 0;
            if (likes >= 50) {
                await this._awardBadgeIfNew(post.authorId, BADGE_KEYS.SOCIAL_BUTTERFLY);
            }
        }

        return post;
    }

    async addComment(postId: string, authorId: string, text: string) {
        const comment = await this.prisma.comment.create({
            data: { postId, authorId, text }
        });

        // Check conversationalist badge
        const commentCount = await this.prisma.comment.count({ where: { authorId } });
        if (commentCount >= 20) {
            await this._awardBadgeIfNew(authorId, BADGE_KEYS.CONVERSATIONALIST);
        }

        return comment;
    }

    async getComments(postId: string, limit: number = 50) {
        const comments = await this.prisma.comment.findMany({
            where: { postId },
            take: limit,
            orderBy: { createdAt: 'asc' }
        });
        return this._withAuthors(comments);
    }

    // ── Challenges ────────────────────────────────────────────────────────────

    async getChallenges(userId?: string) {
        return this.prisma.challenge.findMany({
            include: {
                participants: userId ? { where: { userId } } : false,
                _count: { select: { participants: true } }
            },
            orderBy: { startDate: 'desc' }
        });
    }

    async joinChallenge(challengeId: string, userId: string) {
        const participant = await this.prisma.challengeParticipant.create({
            data: { challengeId, userId }
        });

        // Check challenge-starter badge
        const joinCount = await this.prisma.challengeParticipant.count({ where: { userId } });
        if (joinCount === 1) {
            await this._awardBadgeIfNew(userId, BADGE_KEYS.CHALLENGE_STARTER);
        }

        return participant;
    }

    async updateChallengeProgress(challengeId: string, userId: string, progress: number) {
        const participant = await this.prisma.challengeParticipant.findUnique({
            where: { challengeId_userId: { challengeId, userId } },
            include: { challenge: true }
        });

        if (!participant) throw new Error('Not joined');
        if (participant.completed) return participant;

        const isCompleted = progress >= 100;

        const updated = await this.prisma.challengeParticipant.update({
            where: { id: participant.id },
            data: { progress, completed: isCompleted }
        });

        if (isCompleted) {
            // Award XP + recalculate level
            await this._addXP(userId, participant.challenge.xpReward);

            // Check challenge-champion badge (5 completions)
            const completedCount = await this.prisma.challengeParticipant.count({
                where: { userId, completed: true }
            });
            if (completedCount >= 5) {
                await this._awardBadgeIfNew(userId, BADGE_KEYS.CHALLENGE_CHAMPION);
            }
        }

        return updated;
    }

    // ── Leaderboard & Scores ─────────────────────────────────────────────────

    async getLeaderboard(limit: number = 10) {
        return this.prisma.userScore.findMany({
            take: limit,
            orderBy: { xp: 'desc' }
        });
    }

    async getUserScore(userId: string) {
        const score = await this.prisma.userScore.findUnique({ where: { userId } });
        if (!score) return { userId, xp: 0, level: 1, xpForNextLevel: 100 };
        const level = xpToLevel(score.xp);
        const nextLevelXp = xpForNextLevel(level);
        return { ...score, level, xpForNextLevel: nextLevelXp };
    }

    /**
     * Leaderboard rows enriched with the real author identity (displayName +
     * avatar) resolved from the user-service. UserScore is keyed by userId, so
     * each row's userId is the authorId we enrich on. Rows whose author cannot
     * be resolved fall back to a neutral 'Zeitra Member' label — but a
     * resolvable author always gets its real displayName (no placeholder).
     */
    async getLeaderboardWithAuthors(limit: number = 10) {
        const rows = await this.getLeaderboard(limit);

        // Map UserScore rows onto the { authorId } shape the resolver enriches.
        const enriched = await this._withAuthors(
            rows.map((row) => ({ authorId: row.userId, ...row }))
        );

        return enriched.map((row) => {
            const author = (row as any).author as
                | { name?: string | null; avatarUrl?: string | null }
                | undefined;
            return {
                userId: row.userId,
                xp: row.xp,
                level: row.level,
                displayName: author?.name ?? 'Zeitra Member',
                avatarUrl: author?.avatarUrl ?? null,
            };
        });
    }

    // ── Social Graph (Follow) ──────────────────────────────────────────────────

    /**
     * Follow `followingId` as `followerId`. Idempotent: re-following is a
     * no-op (the @@unique([followerId, followingId]) constraint is honoured via
     * createMany skipDuplicates). Self-follow is rejected with SelfFollowError.
     */
    async followUser(followerId: string, followingId: string) {
        if (followerId === followingId) throw new SelfFollowError();

        await this.prisma.follow.createMany({
            data: [{ followerId, followingId }],
            skipDuplicates: true,
        });

        return { success: true };
    }

    /** Unfollow `followingId`. Idempotent: deleting a non-existent edge is a no-op. */
    async unfollowUser(followerId: string, followingId: string) {
        await this.prisma.follow.deleteMany({
            where: { followerId, followingId },
        });

        return { success: true };
    }

    /**
     * Social summary of `targetId` from `viewerId`'s perspective:
     *   isFollowing — does viewer follow target?
     *   followers   — how many users follow target (following_id = target)
     *   following   — how many users target follows (follower_id = target)
     */
    async getSocial(viewerId: string, targetId: string) {
        const [viewerEdge, followers, following] = await Promise.all([
            this.prisma.follow.findUnique({
                where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
            }),
            this.prisma.follow.count({ where: { followingId: targetId } }),
            this.prisma.follow.count({ where: { followerId: targetId } }),
        ]);

        return {
            isFollowing: !!viewerEdge,
            followers,
            following,
        };
    }

    /**
     * Compose a detailed profile honouring the target's privacy setting.
     *
     * Always returns the minimal public shape { userId, displayName, avatarUrl,
     * isPrivate }. If the target is private AND the viewer is NOT an accepted
     * follower (no Follow row viewer -> target), nothing beyond the minimal
     * shape is returned. Otherwise the fuller object (incl. xp/level + social
     * counts) is returned. A Follow row is treated as accepted — following a
     * private user grants visibility immediately.
     */
    async getUserDetailedProfile(viewerId: string, targetId: string) {
        const author = this.authorResolver
            ? await this.authorResolver.resolveOne(targetId).catch((err) => {
                logger.warn({ err, targetId }, 'detailed-profile author resolve failed');
                return null;
            })
            : null;

        const isPrivate = author?.isPrivate ?? false;

        // Minimal shape always returned (name/avatar are public).
        const minimal = {
            userId: targetId,
            displayName: author?.name ?? null,
            avatarUrl: author?.avatarUrl ?? null,
            isPrivate,
        };

        if (isPrivate && viewerId !== targetId) {
            const edge = await this.prisma.follow.findUnique({
                where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
            });
            // Private + not an accepted follower -> withhold detailed fields.
            if (!edge) return minimal;
        }

        // Visible: own profile, public profile, or an accepted follower.
        const [score, social] = await Promise.all([
            this.getUserScore(targetId),
            this.getSocial(viewerId, targetId),
        ]);

        return {
            ...minimal,
            xp: score.xp,
            level: score.level,
            xpForNextLevel: (score as any).xpForNextLevel,
            ...social,
        };
    }

    // ── Badge System ─────────────────────────────────────────────────────────

    async getBadgeCatalog() {
        return this.prisma.badge.findMany({ orderBy: [{ tier: 'asc' }, { name: 'asc' }] });
    }

    async getUserBadges(userId: string) {
        const userBadges = await this.prisma.userBadge.findMany({
            where: { userId },
            include: { badge: true },
            orderBy: { awardedAt: 'desc' }
        });
        return userBadges.map(ub => ({
            ...ub.badge,
            awardedAt: ub.awardedAt,
            seen: ub.seen,
        }));
    }

    async getUnseenBadges(userId: string) {
        const unseen = await this.prisma.userBadge.findMany({
            where: { userId, seen: false },
            include: { badge: true }
        });
        // Mark all as seen
        if (unseen.length > 0) {
            await this.prisma.userBadge.updateMany({
                where: { userId, seen: false },
                data: { seen: true }
            });
        }
        return unseen.map(ub => ({ ...ub.badge, awardedAt: ub.awardedAt }));
    }

    // Manual badge award endpoint (for admin / workout events from other services)
    async awardBadgeByKey(userId: string, badgeKey: string) {
        return this._awardBadgeIfNew(userId, badgeKey);
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    // Attach author info to a list of posts/comments. Additive + backward
    // compatible: if no resolver is configured or resolution fails, the rows
    // are returned unchanged.
    private async _withAuthors<T extends { authorId?: string | null }>(items: T[]) {
        if (!this.authorResolver) return items;
        try {
            return await this.authorResolver.attachAuthors(items);
        } catch (err) {
            logger.warn({ err }, 'Author enrichment failed; returning rows without author');
            return items;
        }
    }

    private async _withAuthor<T extends { authorId?: string | null }>(item: T) {
        if (!this.authorResolver) return item;
        try {
            return await this.authorResolver.attachAuthor(item);
        } catch (err) {
            logger.warn({ err }, 'Author enrichment failed; returning row without author');
            return item;
        }
    }

    private async _addXP(userId: string, amount: number) {
        const score = await this.prisma.userScore.upsert({
            where: { userId },
            create: { userId, xp: amount, level: xpToLevel(amount) },
            update: { xp: { increment: amount } }
        });

        // Recalculate level after increment
        const totalXp = score.xp;
        const newLevel = xpToLevel(totalXp);

        if (newLevel !== score.level) {
            await this.prisma.userScore.update({
                where: { userId },
                data: { level: newLevel }
            });
        }

        // Check XP-threshold badges
        await this._checkXpBadges(userId, totalXp, newLevel);
    }

    private async _checkXpBadges(userId: string, xp: number, level: number) {
        if (xp >= 500) await this._awardBadgeIfNew(userId, BADGE_KEYS.POWER_USER);
        if (xp >= 1000) await this._awardBadgeIfNew(userId, BADGE_KEYS.ON_FIRE);
        if (xp >= 5000) await this._awardBadgeIfNew(userId, BADGE_KEYS.ELITE);
        if (level >= 5) await this._awardBadgeIfNew(userId, BADGE_KEYS.NEWCOMER);
        if (level >= 10) await this._awardBadgeIfNew(userId, BADGE_KEYS.VETERAN);
        if (level >= 20) await this._awardBadgeIfNew(userId, BADGE_KEYS.LEGEND);
    }

    private async _awardBadgeIfNew(userId: string, badgeKey: string) {
        try {
            const badge = await this.prisma.badge.findUnique({ where: { key: badgeKey } });
            if (!badge) return null;

            const existing = await this.prisma.userBadge.findUnique({
                where: { userId_badgeId: { userId, badgeId: badge.id } }
            });
            if (existing) return null; // Already has it

            const userBadge = await this.prisma.userBadge.create({
                data: { userId, badgeId: badge.id, seen: false }
            });

            // Award bonus XP for earning the badge itself (only non-XP badges)
            if (badge.xpReward > 0) {
                await this.prisma.userScore.upsert({
                    where: { userId },
                    create: { userId, xp: badge.xpReward, level: xpToLevel(badge.xpReward) },
                    update: { xp: { increment: badge.xpReward } }
                });
            }

            logger.info({ userId, badgeKey }, 'Badge awarded');
            return userBadge;
        } catch (err: any) {
            // P2002 = duplicate — ignore
            if (err?.code !== 'P2002') {
                logger.error({ err, userId, badgeKey }, 'Failed to award badge');
            }
            return null;
        }
    }
}
