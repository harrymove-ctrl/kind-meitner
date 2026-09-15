import { describe, expect, it, vi } from "vitest";

import type { Action, Group } from "@/state/store";
import { provisionOnboardingDefaultRoom, shouldProvisionDefaultRoom } from "./onboarding-default-room";

const room: Group = {
  id: "channel-1",
  threadId: "channel-1-thread",
  name: "Channel 1",
  memberIds: ["seed"],
  defaultResponder: { kind: "member", botId: "seed" },
  bulletin: "",
  unread: false,
  createdAt: 1,
  setupCompletedAt: 1,
  messages: [],
};

describe("onboarding default room handoff", () => {
  it("applies and selects only the persisted room returned by the server", async () => {
    const request = vi.fn(async () => ({ room }));
    const dispatch = vi.fn<(action: Action) => void>();

    await provisionOnboardingDefaultRoom(request, dispatch);

    expect(request).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "groupPatched", group: room },
      { type: "select", id: room.id },
    ]);
  });

  it("does not select a room when the server response has no room", async () => {
    const dispatch = vi.fn<(action: Action) => void>();
    await provisionOnboardingDefaultRoom(async () => ({}), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("provisions on a first finish but not an instructional replay", () => {
    expect(shouldProvisionDefaultRoom(false)).toBe(true);
    expect(shouldProvisionDefaultRoom(true)).toBe(false);
  });
});
