import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Review, REVIEWS, Version, VERSIONS } from '@/data/mockData';

interface ReviewState {
  reviews: Review[];
  versions: Version[];
  addReview: (review: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>) => void;
  addVersion: (version: Omit<Version, 'id' | 'createdAt'>) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      reviews: REVIEWS,
      versions: VERSIONS,
      addReview: (review) =>
        set((state) => ({
          reviews: [
            {
              ...review,
              id: `rev-${Date.now()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...state.reviews,
          ],
        })),
      addVersion: (version) =>
        set((state) => ({
          versions: [
            {
              ...version,
              id: `ver-${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
            ...state.versions,
          ],
        })),
    }),
    {
      name: 'forge-review-storage',
    }
  )
);
