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

// Defensive cap on the badge bonus-XP cascade. A badge can only be awarded once
// (the per-badge idempotency guard), so the cascade self-terminates after at
// most one pass per distinct badge; this depth limit is a belt-and-braces guard
// against an accidental cycle in badge bonus XP causing unbounded recursion.
const BADGE_CASCADE_MAX_DEPTH = 16;

export class CommunityService {
    constructor(
        private prisma: PrismaClient,
        private authorResolver?: AuthorResolver
    ) { }

    // ── Feed & Posts ──────────────────────────────────────────────────────────

    async getFeed(viewerId: string, limit: number = 20, cursor?: string) {
        const posts = await this.prisma.post.findMany({
            take: limit,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { comments: true } },
            }
        });
        // Privacy gate: drop posts whose author is private and not followed by the
        // viewer (the author's own + public-author posts always pass). Mirrors
        // canViewUserContent but batched over the page so we don't N+1 the
        // resolver / follow lookups.
        const visible = await this._filterViewablePosts(viewerId, posts);
        const withAuthors = await this._withAuthors(visible);
        return this._withViewerLikes(viewerId, withAuthors);
    }

    /**
     * Filter a page of posts to those the viewer may see. A post passes when its
     * author is the viewer, the author is PUBLIC, or the viewer is an accepted
     * follower of a PRIVATE author. Author privacy is batch-resolved and the
     * required follow edges are fetched in a single query.
     */
    private async _filterViewablePosts<T extends { authorId?: string | null }>(
        viewerId: string,
        posts: T[]
    ): Promise<T[]> {
        if (posts.length === 0) return posts;

        // Distinct foreign authors (skip the viewer's own + falsy ids).
        const authorIds = [
            ...new Set(
                posts
                    .map((p) => p.authorId)
                    .filter((id): id is string => !!id && id !== viewerId)
            ),
        ];
        if (authorIds.length === 0) return posts;

        // Resolve privacy for each distinct author.
        const authors = this.authorResolver
            ? await this.authorResolver.resolveMany(authorIds).catch((err) => {
                logger.warn({ err }, 'feed author resolve failed; treating authors as public');
                return new Map();
            })
            : new Map();

        const privateAuthorIds = authorIds.filter((id) => authors.get(id)?.isPrivate);
        if (privateAuthorIds.length === 0) return posts;

        // Which private authors does the viewer follow? One query for the page.
        const edges = await this.prisma.follow.findMany({
            where: { followerId: viewerId, followingId: { in: privateAuthorIds } },
            select: { followingId: true },
        });
        const followed = new Set(edges.map((e: { followingId: string }) => e.followingId));
        const privateSet = new Set(privateAuthorIds);

        return posts.filter((p) => {
            const aid = p.authorId;
            if (!aid || aid === viewerId) return true;
            if (!privateSet.has(aid)) return true; // public author
            return followed.has(aid);              // private: only if followed
        });
    }

    async getPostById(viewerId: string, postId: string) {
        const post = await this.prisma.post.findUnique({
            where: { id: postId },
            include: { _count: { select: { comments: true } } }
        });
        if (!post) return post;
        // Privacy gate: hide a private author's post from a non-follower. Return
        // null so the route maps it to 404 (do not disclose existence).
        if (post.authorId && !(await this.canViewUserContent(viewerId, post.authorId))) {
            return null;
        }
        const withAuthor = await this._withAuthor(post);
        return { ...withAuthor, liked: await this._viewerHasLiked(viewerId, postId) };
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

    /**
     * Like `postId` as `likerId`. Idempotent and de-duplicated per user: the
     * Post.likes counter is incremented only on a user's FIRST like, enforced by
     * the @@unique([userId, postId]) constraint on PostLike. A second like by the
     * same user is a no-op (the unique violation is swallowed, the counter is not
     * touched), so a single user can no longer inflate a post's like count and
     * game the Social Butterfly badge.
     *
     * `likerId` is required for de-duplication; without it we cannot attribute a
     * like to a user, so we fall back to the unconditional increment ONLY when no
     * likerId is supplied (legacy / unauthenticated callers). The route always
     * passes the authenticated caller's id.
     */
    async likePost(postId: string, likerId?: string) {
        let counted = false;

        if (likerId) {
            // Check-then-act inside a transaction; the unique constraint is the
            // real guard against a concurrent double-like (catch P2002 below).
            try {
                counted = await this.prisma.$transaction(async (tx: any) => {
                    const existing = await tx.postLike.findUnique({
                        where: { userId_postId: { userId: likerId, postId } },
                    });
                    if (existing) return false; // already liked — no-op
                    await tx.postLike.create({ data: { userId: likerId, postId } });
                    await tx.post.update({
                        where: { id: postId },
                        data: { likes: { increment: 1 } },
                    });
                    return true;
                });
            } catch (err: any) {
                // P2002 = the user already liked (lost the race). Idempotent no-op.
                if (err?.code !== 'P2002') throw err;
                counted = false;
            }
        } else {
            // Legacy path: no liker identity to de-dupe on, keep prior behaviour.
            await this.prisma.post.update({
                where: { id: postId },
                data: { likes: { increment: 1 } },
            });
            counted = true;
        }

        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) return post;

        // Check social butterfly badge for the post author — only worth
        // recomputing when a like was actually newly counted. The aggregate sums
        // Post.likes, each of which is now a count of DISTINCT per-user likes, so
        // the badge can no longer be gamed by one user re-liking.
        if (counted && post.authorId) {
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

    /**
     * Unlike `postId` as `likerId`. Idempotent: removes the PostLike row and
     * decrements Post.likes only when a like by this user actually existed.
     * Unliking a post the user never liked is a no-op (counter never goes
     * negative). Mirrors the idempotency contract of likePost.
     */
    async unlikePost(postId: string, likerId: string) {
        try {
            await this.prisma.$transaction(async (tx: any) => {
                const deleted = await tx.postLike.deleteMany({
                    where: { userId: likerId, postId },
                });
                if (deleted.count > 0) {
                    await tx.post.update({
                        where: { id: postId },
                        data: { likes: { decrement: 1 } },
                    });
                }
            });
        } catch (err: any) {
            // Post may have been deleted concurrently — treat as a no-op.
            if (err?.code !== 'P2025') throw err;
        }

        return this.prisma.post.findUnique({ where: { id: postId } });
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

    async getComments(viewerId: string, postId: string, limit: number = 50) {
        // Privacy gate: comments inherit the post author's visibility. If the
        // post is gone or its (private) author isn't viewable by the viewer,
        // return an empty list rather than leaking the thread.
        const post = await this.prisma.post.findUnique({
            where: { id: postId },
            select: { authorId: true },
        });
        if (!post) return this._withAuthors([]);
        if (post.authorId && !(await this.canViewUserContent(viewerId, post.authorId))) {
            return this._withAuthors([]);
        }
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

    // Attach the viewer's per-post like state (`liked`) to a page of posts in ONE
    // query (no N+1): look up which of the page's post ids this viewer has a
    // post_likes row for. An anonymous/absent viewer or empty page resolves to
    // liked:false everywhere. This is what lets the client render the heart's real
    // state on load and drive a like/unlike toggle instead of a session guess.
    private async _withViewerLikes<T extends Record<string, any>>(
        viewerId: string | undefined,
        posts: T[]
    ): Promise<Array<T & { liked: boolean }>> {
        if (!viewerId || posts.length === 0) {
            return posts.map((p) => ({ ...p, liked: false }));
        }
        const ids = posts.map((p) => p.id);
        const likes = await this.prisma.postLike.findMany({
            where: { userId: viewerId, postId: { in: ids } },
            select: { postId: true },
        });
        const likedIds = new Set(likes.map((l: { postId: string }) => l.postId));
        return posts.map((p) => ({ ...p, liked: likedIds.has(p.id) }));
    }

    // Single-post sibling of _withViewerLikes (used by getPostById).
    private async _viewerHasLiked(viewerId: string | undefined, postId: string): Promise<boolean> {
        if (!viewerId) return false;
        const row = await this.prisma.postLike.findUnique({
            where: { userId_postId: { userId: viewerId, postId } },
        });
        return !!row;
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

    private async _checkXpBadges(userId: string, xp: number, level: number, depth: number = 0) {
        if (xp >= 500) await this._awardBadgeIfNew(userId, BADGE_KEYS.POWER_USER, depth);
        if (xp >= 1000) await this._awardBadgeIfNew(userId, BADGE_KEYS.ON_FIRE, depth);
        if (xp >= 5000) await this._awardBadgeIfNew(userId, BADGE_KEYS.ELITE, depth);
        if (level >= 5) await this._awardBadgeIfNew(userId, BADGE_KEYS.NEWCOMER, depth);
        if (level >= 10) await this._awardBadgeIfNew(userId, BADGE_KEYS.VETERAN, depth);
        if (level >= 20) await this._awardBadgeIfNew(userId, BADGE_KEYS.LEGEND, depth);
    }

    private async _awardBadgeIfNew(userId: string, badgeKey: string, depth: number = 0) {
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

            // Award bonus XP for earning the badge itself. The bonus can push the
            // user across a higher XP/level threshold, so we must recompute +
            // persist the level and re-run the XP-badge checks against the NEW
            // total — otherwise the next badge wouldn't be granted until the
            // user's next XP event (the cascade bug). Recursion is naturally
            // bounded: each badge is awarded at most once (the `existing` guard
            // short-circuits), but we also cap depth defensively against any
            // cycle in badge bonus XP.
            if (badge.xpReward > 0 && depth < BADGE_CASCADE_MAX_DEPTH) {
                const score = await this.prisma.userScore.upsert({
                    where: { userId },
                    create: { userId, xp: badge.xpReward, level: xpToLevel(badge.xpReward) },
                    update: { xp: { increment: badge.xpReward } }
                });

                // Recalculate + persist level after the bonus increment.
                const totalXp = score.xp;
                const newLevel = xpToLevel(totalXp);
                if (newLevel !== score.level) {
                    await this.prisma.userScore.update({
                        where: { userId },
                        data: { level: newLevel }
                    });
                }

                // Cascade: a crossed threshold may award the next XP/level badge
                // in the same pass. _awardBadgeIfNew is idempotent per badge, so
                // this terminates.
                await this._checkXpBadges(userId, totalXp, newLevel, depth + 1);
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

    // ── GDPR purge (server-to-server only) ──────────────────────────────────────
    // PERMANENTLY erases EVERY community-service row owned by `userId` across all
    // of this service's user-owned tables. IDEMPOTENT: every delete is a
    // deleteMany, which never throws on zero matched rows, so purging a user with
    // no data (or re-purging) returns all-zero counts and 200. Wrapped in a single
    // $transaction so the purge is atomic — either every table is cleared or none.
    //
    // We delete only the user's OWN rows:
    //   • posts                  — author_id = userId (cascades to ALL comments on
    //                              those posts via comments.post onDelete: Cascade)
    //   • comments               — author_id = userId (the user's own comments on
    //                              OTHER people's posts; not covered by the cascade)
    //   • post_likes             — user_id = userId (likes the user made)
    //   • user_scores            — user_id = userId (the user's XP/level row)
    //   • user_badges            — user_id = userId (badges the user earned)
    //   • challenge_participants  — user_id = userId (the user's challenge entries)
    //   • follows                — follower_id = userId OR following_id = userId
    //                              (both directions are the user's own social-graph
    //                              edges; we leave OTHER users' edges intact)
    //
    // We never touch shared/catalog rows the user does not own (badges, challenges)
    // nor other users' posts/comments/likes.
    async purgeUser(userId: string): Promise<{
        posts: number;
        comments: number;
        post_likes: number;
        user_scores: number;
        user_badges: number;
        challenge_participants: number;
        follows: number;
    }> {
        const [
            posts,
            comments,
            postLikes,
            userScores,
            userBadges,
            challengeParticipants,
            follows,
        ] = await this.prisma.$transaction([
            // Delete the user's posts first — this cascades to every comment on
            // those posts (comments.post onDelete: Cascade) before we count the
            // user's remaining own comments below.
            this.prisma.post.deleteMany({ where: { authorId: userId } }),
            // The user's own comments on OTHER people's posts (the cascade above
            // already removed their comments on their own posts).
            this.prisma.comment.deleteMany({ where: { authorId: userId } }),
            this.prisma.postLike.deleteMany({ where: { userId } }),
            this.prisma.userScore.deleteMany({ where: { userId } }),
            this.prisma.userBadge.deleteMany({ where: { userId } }),
            this.prisma.challengeParticipant.deleteMany({ where: { userId } }),
            // Both directions of the social graph belong to the user.
            this.prisma.follow.deleteMany({
                where: { OR: [{ followerId: userId }, { followingId: userId }] },
            }),
        ]);

        return {
            posts: posts.count,
            comments: comments.count,
            post_likes: postLikes.count,
            user_scores: userScores.count,
            user_badges: userBadges.count,
            challenge_participants: challengeParticipants.count,
            follows: follows.count,
        };
    }

    // ── GDPR data export (server-to-server only) ────────────────────────────────
    // Read-only counterpart of purgeUser. Returns EVERY community-service row owned
    // by `userId`, keyed by table name, across the SAME user-owned tables the purge
    // erases — so export and erasure stay in sync (see purgeUser above):
    //   • posts                  — author_id = userId (the user's own posts)
    //   • comments               — author_id = userId (the user's own comments,
    //                              including those on their own posts that the purge
    //                              removes via the post cascade; here we report the
    //                              full set the user authored, by author_id)
    //   • post_likes             — user_id = userId (likes the user made)
    //   • user_scores            — user_id = userId (the user's XP/level row)
    //   • user_badges            — user_id = userId (badges the user earned)
    //   • challenge_participants  — user_id = userId (the user's challenge entries)
    //   • follows                — follower_id = userId OR following_id = userId
    //                              (both directions of the user's own social graph)
    //
    // SECURITY: this service's schema has NO password/token/secret/raw-key columns
    // (posts/comments are free text, scores/badges/participants/follows are ids +
    // counters), so every column is safe to export verbatim — there is nothing to
    // redact. Should a sensitive column ever be added to these tables, it MUST be
    // excluded/redacted here.
    //
    // BOUNDING: posts/comments/post_likes are the only tables that can grow large
    // for a heavy user; each is capped (newest first) so a single export can't pull
    // an unbounded result set, and the response flags whether a cap was hit. The
    // remaining tables are bounded by nature (0/1 score row; one badge per badge;
    // one participant row per challenge; follows are the user's own edges).
    // Read-only and idempotent: no writes, repeatable with identical output for
    // unchanged data.
    async exportUser(userId: string): Promise<{
        posts: any[];
        comments: any[];
        post_likes: any[];
        user_scores: any[];
        user_badges: any[];
        challenge_participants: any[];
        follows: any[];
        _meta: {
            postsTruncated: boolean;
            commentsTruncated: boolean;
            postLikesTruncated: boolean;
            rowLimit: number;
        };
    }> {
        const EXPORT_ROW_LIMIT = 50_000;
        // take = LIMIT+1 so we can detect (and flag) truncation without a 2nd query.
        const TAKE = EXPORT_ROW_LIMIT + 1;

        const [
            posts,
            comments,
            postLikes,
            userScores,
            userBadges,
            challengeParticipants,
            follows,
        ] = await Promise.all([
            this.prisma.post.findMany({
                where: { authorId: userId },
                orderBy: { createdAt: 'desc' },
                take: TAKE,
            }),
            this.prisma.comment.findMany({
                where: { authorId: userId },
                orderBy: { createdAt: 'desc' },
                take: TAKE,
            }),
            this.prisma.postLike.findMany({
                where: { userId },
                take: TAKE,
            }),
            this.prisma.userScore.findMany({ where: { userId } }),
            this.prisma.userBadge.findMany({ where: { userId } }),
            this.prisma.challengeParticipant.findMany({ where: { userId } }),
            this.prisma.follow.findMany({
                where: { OR: [{ followerId: userId }, { followingId: userId }] },
            }),
        ]);

        const postsTruncated = posts.length > EXPORT_ROW_LIMIT;
        const commentsTruncated = comments.length > EXPORT_ROW_LIMIT;
        const postLikesTruncated = postLikes.length > EXPORT_ROW_LIMIT;

        return {
            posts: postsTruncated ? posts.slice(0, EXPORT_ROW_LIMIT) : posts,
            comments: commentsTruncated ? comments.slice(0, EXPORT_ROW_LIMIT) : comments,
            post_likes: postLikesTruncated ? postLikes.slice(0, EXPORT_ROW_LIMIT) : postLikes,
            user_scores: userScores,
            user_badges: userBadges,
            challenge_participants: challengeParticipants,
            follows,
            _meta: {
                postsTruncated,
                commentsTruncated,
                postLikesTruncated,
                rowLimit: EXPORT_ROW_LIMIT,
            },
        };
    }
}
