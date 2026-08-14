import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Review, REVIEWS, Version, VERSIONS, SHOTS } from '@/data/mockData';

/**
 * The single mock "version" both the internal review player and the client
 * review portal treat as the active session for Presentation Mode purposes.
 * This is a stand-in for a real per-shot/per-version review-session id.
 */
export const PRESENTED_VERSION_ID = 'seq-020-sh-040-v003';

export interface PresentationState {
  /** Whether an internal reviewer currently has the floor. */
  isActive: boolean;
  /** Which review/version session is being presented. */
  versionId: string | null;
  /** currentUser.id of the presenter. */
  presenterId: string | null;
  /** Snapshot of the presenter's display name, so locked viewers don't need a user lookup. */
  presenterName: string | null;
  /** The presenter's live playhead — locked viewers mirror this frame. */
  frame: number;
  startedAt: string | null;
}

const DEFAULT_PRESENTATION: PresentationState = {
  isActive: false,
  versionId: null,
  presenterId: null,
  presenterName: null,
  frame: 1,
  startedAt: null,
};

/** A comment left on the internal review player's timeline, optionally a voice note. */
export interface ReviewComment {
  id: string;
  userIndex: number;
  frame: number;
  text: string;
  /** Playable URL for a recorded voice note. In this mock, a `blob:` object
   * URL from a real MediaRecorder capture — session-scoped only, since blob
   * URLs don't survive a reload (the tab that created them is gone). */
  audioUrl?: string;
  /** Amplitude samples (0..1) captured live via Web Audio during recording,
   * used to draw a real (not decorative-fake) waveform for playback. */
  waveform?: number[];
  /** Present only for comments that started life as a client-portal note and
   * were explicitly transferred into this internal stream by a team member —
   * client feedback never appears here automatically. */
  fromClient?: {
    authorName: string;
    shotName: string;
    transferredByUserName: string;
    transferredAt: string;
  };
}

const INITIAL_COMMENTS: ReviewComment[] = [
  { id: 'c1', userIndex: 1, frame: 45, text: 'The rim light on the left side is blowing out a bit too much.' },
  { id: 'c2', userIndex: 0, frame: 112, text: 'Agreed. Also, can we add a bit more falloff to the shadow here?' },
];

/**
 * A note a client leaves in the client-review portal. Notes are NOT visible
 * to the internal team by default — they sit here, pending, until an
 * internal reviewer explicitly transfers one into the shared `comments`
 * stream (see `transferClientNote`). This moderation gate is the point:
 * client feedback should never silently leak into internal channels.
 */
export interface ClientNote {
  id: string;
  shotId: string;
  shotName: string;
  frame: number;
  text: string;
  authorName: string;
  createdAt: string;
  transferred: boolean;
  transferredAt: string | null;
  transferredByUserName: string | null;
}

const seedClientShot = SHOTS.find((s) => s.status === 'client-review');
const INITIAL_CLIENT_NOTES: ClientNote[] = seedClientShot
  ? [
      {
        id: 'cn1',
        shotId: seedClientShot.id,
        shotName: seedClientShot.name,
        frame: 88,
        text: 'Loving the direction here — can we push the rim light a touch warmer to match the previous shot?',
        authorName: 'Client Reviewer',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        transferred: false,
        transferredAt: null,
        transferredByUserName: null,
      },
    ]
  : [];

interface ReviewState {
  reviews: Review[];
  versions: Version[];
  addReview: (review: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>) => void;
  addVersion: (version: Omit<Version, 'id' | 'createdAt'>) => void;

  /**
   * entityId (shot/asset id) -> id of the version a Rollback action made
   * current. Absent entries fall back to whatever the entity's own record
   * says its current version is — this only tracks explicit overrides, so a
   * Rollback is a real, persisted state change rather than a toast that
   * leaves nothing behind.
   */
  currentVersionOverrides: Record<string, string>;
  /** Roll a shot/asset back to a specific past version, making it current. */
  rollbackToVersion: (entityId: string, versionId: string) => void;

  presentation: PresentationState;
  /** Internal reviewer starts presenting a version, locking every other viewer's playhead to theirs. */
  startPresentation: (params: { versionId: string; presenterId: string; presenterName: string; frame: number }) => void;
  /** Presenter ends the session, releasing all locked viewers. */
  stopPresentation: () => void;
  /** Presenter's playhead moved (scrub, play, jump-to-comment, etc) — pushed out to locked viewers. */
  setPresenterFrame: (frame: number) => void;

  comments: ReviewComment[];
  addComment: (comment: Omit<ReviewComment, 'id'>) => void;

  clientNotes: ClientNote[];
  /** A client leaves feedback in the portal — held in moderation, not yet visible internally. */
  addClientNote: (note: Pick<ClientNote, 'shotId' | 'shotName' | 'frame' | 'text' | 'authorName'>) => void;
  /** An internal reviewer explicitly publishes a client note into the shared `comments` stream. */
  transferClientNote: (id: string, transferredByUserName: string) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
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

      currentVersionOverrides: {},
      rollbackToVersion: (entityId, versionId) =>
        set((state) => ({
          currentVersionOverrides: { ...state.currentVersionOverrides, [entityId]: versionId },
        })),

      presentation: DEFAULT_PRESENTATION,
      startPresentation: ({ versionId, presenterId, presenterName, frame }) =>
        set({
          presentation: {
            isActive: true,
            versionId,
            presenterId,
            presenterName,
            frame,
            startedAt: new Date().toISOString(),
          },
        }),
      stopPresentation: () => set({ presentation: DEFAULT_PRESENTATION }),
      setPresenterFrame: (frame) => {
        const { presentation } = get();
        if (!presentation.isActive) return;
        set({ presentation: { ...presentation, frame } });
      },

      comments: INITIAL_COMMENTS,
      addComment: (comment) =>
        set((state) => ({
          comments: [...state.comments, { ...comment, id: `c-${Date.now()}` }],
        })),

      clientNotes: INITIAL_CLIENT_NOTES,
      addClientNote: (note) =>
        set((state) => ({
          clientNotes: [
            {
              ...note,
              id: `cn-${Date.now()}`,
              createdAt: new Date().toISOString(),
              transferred: false,
              transferredAt: null,
              transferredByUserName: null,
            },
            ...state.clientNotes,
          ],
        })),
      transferClientNote: (id, transferredByUserName) =>
        set((state) => {
          const note = state.clientNotes.find((n) => n.id === id);
          if (!note || note.transferred) return state;
          const timestamp = new Date().toISOString();
          return {
            clientNotes: state.clientNotes.map((n) =>
              n.id === id ? { ...n, transferred: true, transferredAt: timestamp, transferredByUserName } : n
            ),
            comments: [
              ...state.comments,
              {
                id: `c-${Date.now()}`,
                userIndex: -1,
                frame: note.frame,
                text: note.text,
                fromClient: {
                  authorName: note.authorName,
                  shotName: note.shotName,
                  transferredByUserName,
                  transferredAt: timestamp,
                },
              },
            ],
          };
        }),
    }),
    {
      name: 'forge-review-storage',
    }
  )
);

// Keep every open tab/window in sync: zustand's `persist` middleware writes
// to localStorage on change but doesn't listen for it, so a second tab
// wouldn't otherwise notice the presenter moved. This is what makes
// Presentation Mode "real" across tabs/sessions in this mock app.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'forge-review-storage') {
      useReviewStore.persist.rehydrate();
    }
  });
}
