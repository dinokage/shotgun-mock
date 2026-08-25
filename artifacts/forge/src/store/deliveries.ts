import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PROJECTS, SHOTS, USERS } from "@/data/mockData";

/**
 * A Delivery is a one-time, scoped handoff of specific FINAL approved files
 * — distinct from the Client Review portal (client-review.tsx), which is an
 * ongoing, reusable feedback loop over whatever's currently in review. A
 * Delivery is frozen at creation time, has its own expiry/revocation, and
 * tracks access — none of which the review portal has or needs, since it's
 * not meant to represent a single point-in-time package.
 */
export interface DeliveryItem {
  shotId: string;
  name: string;
  thumbnailSeed: number;
}

export type DeliveryStatus = "active" | "revoked";

export interface Delivery {
  id: string;
  projectId: string;
  title: string;
  clientName: string;
  items: DeliveryItem[];
  accessCode: string;
  status: DeliveryStatus;
  createdById: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string | null;
  notes: string;
  downloadCount: number;
  lastAccessedAt: string | null;
}

/**
 * Statuses considered "finished enough to hand over." `approved`/`published`
 * are the ideal case (a shot went through client sign-off or the manager
 * approval chain), but they're only ever reached at runtime via those flows
 * — the mock data generator never seeds a shot directly into either status,
 * so a fresh app load has zero of them. `complete` is a real, seeded status
 * (15 shots out of 100) and is the closest available proxy for "internally
 * finished" without requiring someone to run the full approval chain first
 * just to see the Deliveries feature have anything to work with.
 */
export const DELIVERY_ELIGIBLE_STATUSES = [
  "complete",
  "approved",
  "published",
] as const;

/** A delivery with an expiresAt in the past is treated as expired regardless
 * of its stored `status` — expiry is computed from the clock, not a flag
 * that could drift out of sync with it. */
export function isDeliveryExpired(delivery: Delivery): boolean {
  return (
    delivery.expiresAt !== null &&
    new Date(delivery.expiresAt).getTime() < Date.now()
  );
}

export function isDeliveryActive(delivery: Delivery): boolean {
  return delivery.status === "active" && !isDeliveryExpired(delivery);
}

function generateAccessCode(): string {
  const words = [
    "orbit",
    "ember",
    "quartz",
    "lumen",
    "atlas",
    "cobalt",
    "raven",
    "delta",
    "nova",
    "aster",
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${digits}`;
}

/** A handful of seeded example deliveries so the feature has real demo
 * content immediately, built from real approved/published shots rather than
 * placeholder rows. */
function buildSeedDeliveries(): Delivery[] {
  const producer = USERS.find((u) => u.role === "vfx_producer");
  const deliveries: Delivery[] = [];

  const candidateProjects = PROJECTS.filter(
    (p) => p.status === "COMPLETE" || p.status === "ON_TRACK",
  ).slice(0, 2);
  candidateProjects.forEach((project, i) => {
    const finishedShots = SHOTS.filter(
      (s) =>
        s.projectId === project.id &&
        (DELIVERY_ELIGIBLE_STATUSES as readonly string[]).includes(s.status),
    ).slice(0, 4);
    if (finishedShots.length === 0) return;

    const createdDaysAgo = i === 0 ? 2 : 9;
    const createdAt = new Date(
      Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000,
    ).toISOString();

    deliveries.push({
      id: `del${i + 1}`,
      projectId: project.id,
      title: `${project.name} — Final Delivery ${i + 1}`,
      clientName: project.client,
      items: finishedShots.map((s) => ({
        shotId: s.id,
        name: s.name,
        thumbnailSeed: s.thumbnailSeed,
      })),
      accessCode: i === 0 ? "orbit-4471" : "ember-1928",
      status: i === 1 ? "revoked" : "active",
      createdById: producer?.id ?? USERS[0].id,
      createdByName: producer?.name ?? USERS[0].name,
      createdAt,
      expiresAt:
        i === 0
          ? new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
          : null,
      notes:
        i === 0
          ? "Final approved shots for the trailer cut — masters only, no proxies."
          : "",
      downloadCount: i === 0 ? 3 : 7,
      lastAccessedAt:
        i === 0
          ? new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  return deliveries;
}

interface DeliveryState {
  deliveries: Delivery[];
  createDelivery: (input: {
    projectId: string;
    title: string;
    clientName: string;
    items: DeliveryItem[];
    createdById: string;
    createdByName: string;
    expiresAt: string | null;
    notes: string;
  }) => Delivery;
  revokeDelivery: (id: string) => void;
  reactivateDelivery: (id: string) => void;
  recordAccess: (id: string) => void;
}

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set, get) => ({
      deliveries: buildSeedDeliveries(),

      createDelivery: (input) => {
        const delivery: Delivery = {
          id: `del-${Date.now()}`,
          status: "active",
          accessCode: generateAccessCode(),
          createdAt: new Date().toISOString(),
          downloadCount: 0,
          lastAccessedAt: null,
          ...input,
        };
        set((state) => ({ deliveries: [delivery, ...state.deliveries] }));
        return delivery;
      },

      revokeDelivery: (id) =>
        set((state) => ({
          deliveries: state.deliveries.map((d) =>
            d.id === id ? { ...d, status: "revoked" as const } : d,
          ),
        })),

      reactivateDelivery: (id) =>
        set((state) => ({
          deliveries: state.deliveries.map((d) =>
            d.id === id ? { ...d, status: "active" as const } : d,
          ),
        })),

      recordAccess: (id) =>
        set((state) => ({
          deliveries: state.deliveries.map((d) =>
            d.id === id
              ? {
                  ...d,
                  downloadCount: d.downloadCount + 1,
                  lastAccessedAt: new Date().toISOString(),
                }
              : d,
          ),
        })),
    }),
    {
      name: "forge-deliveries",
    },
  ),
);
