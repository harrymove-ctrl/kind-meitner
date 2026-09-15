import type { Action, Group } from "@/state/store";

export type DefaultRoomResponse = { room?: Group };
export type DefaultRoomRequest = () => Promise<DefaultRoomResponse>;

/** Replaying the welcome tour is instructional only and must not affect rooms. */
export function shouldProvisionDefaultRoom(replay: boolean): boolean {
  return !replay;
}

/** Apply only the server-owned room returned by the idempotent endpoint. */
export async function provisionOnboardingDefaultRoom(
  request: DefaultRoomRequest,
  dispatch: (action: Action) => void,
): Promise<void> {
  const { room } = await request();
  if (!room) return;
  dispatch({ type: "groupPatched", group: room });
  dispatch({ type: "select", id: room.id });
}
