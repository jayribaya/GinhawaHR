import { QueryClient } from "@tanstack/react-query";
import { useSession } from "../services/api";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      gcTime: 60000,
      refetchOnWindowFocus: false,
    },
  },
});
useSession.subscribe((state, previous) => {
  if (previous.actor && previous.actor.userId !== state.actor?.userId)
    queryClient.clear();
});
