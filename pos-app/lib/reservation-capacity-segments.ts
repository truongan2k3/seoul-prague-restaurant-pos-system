import type { SlotAvailability } from "@/lib/reservation-capacity-engine";

export type CapacityTimelineSlot = {
  time: string;
  availability: SlotAvailability;
};

export type CapacityAvailabilitySegment = {
  startTime: string;
  endTime: string;
  availability: SlotAvailability;
  slotCount: number;
};

/** Merge consecutive operating times with the same availability (for staff summaries). */
export function groupCapacityTimelineSegments(
  slots: CapacityTimelineSlot[],
): CapacityAvailabilitySegment[] {
  if (slots.length === 0) return [];

  const segments: CapacityAvailabilitySegment[] = [];
  let start = slots[0]!.time;
  let prev = slots[0]!;
  let count = 1;

  for (let i = 1; i < slots.length; i += 1) {
    const row = slots[i]!;
    if (row.availability === prev.availability) {
      count += 1;
      prev = row;
      continue;
    }
    segments.push({
      startTime: start,
      endTime: prev.time,
      availability: prev.availability,
      slotCount: count,
    });
    start = row.time;
    prev = row;
    count = 1;
  }

  segments.push({
    startTime: start,
    endTime: prev.time,
    availability: prev.availability,
    slotCount: count,
  });

  return segments;
}
