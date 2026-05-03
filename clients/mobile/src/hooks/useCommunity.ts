import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getFeed,
    createPost,
    likePost,
    getChallenges,
    joinChallenge,
    getLeaderboard,
} from '@/api/community';

/**
 * Feed, challenges, and social hook.
 */
export function useCommunity() {
    const queryClient = useQueryClient();

    const feedQuery = useQuery({
        queryKey: ['community', 'feed'],
        queryFn: () => getFeed(),
        staleTime: 2 * 60 * 1000,
    });

    const challengesQuery = useQuery({
        queryKey: ['community', 'challenges'],
        queryFn: getChallenges,
        staleTime: 5 * 60 * 1000,
    });

    const leaderboardQuery = useQuery({
        queryKey: ['community', 'leaderboard'],
        queryFn: () => getLeaderboard(),
        staleTime: 5 * 60 * 1000,
    });

    const postMutation = useMutation({
        mutationFn: (payload: { content: string; imageUrl?: string }) =>
            createPost(payload.content, payload.imageUrl),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community', 'feed'] });
        },
        onError: (err: any) => {
            console.error('[useCommunity] createPost failed:', err);
        },
    });

    const likeMutation = useMutation({
        mutationFn: (postId: string) => likePost(postId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community', 'feed'] });
        },
        onError: (err: any) => {
            console.error('[useCommunity] likePost failed:', err);
        },
    });

    const joinMutation = useMutation({
        mutationFn: (challengeId: string) => joinChallenge(challengeId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community', 'challenges'] });
        },
        onError: (err: any) => {
            console.error('[useCommunity] joinChallenge failed:', err);
        },
    });

    return {
        feed: feedQuery.data ?? [],
        challenges: challengesQuery.data ?? [],
        leaderboard: leaderboardQuery.data ?? [],

        isLoadingFeed: feedQuery.isLoading,
        isLoadingChallenges: challengesQuery.isLoading,
        isLoadingLeaderboard: leaderboardQuery.isLoading,

        createPost: postMutation.mutateAsync,
        likePost: likeMutation.mutateAsync,
        joinChallenge: joinMutation.mutateAsync,

        isPosting: postMutation.isPending,
        refetchFeed: feedQuery.refetch,
        refetchChallenges: challengesQuery.refetch,
    };
}
