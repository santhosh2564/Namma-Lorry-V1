import { PermissionStatus } from "expo-location";

import {
  backgroundStateFrom,
  foregroundStateFrom,
  nextPendingRow,
  notificationsStateFrom,
  PERMISSION_ROW_ORDER,
  permissionsComplete,
  permissionsLost,
  type PermissionSnapshot,
} from "@/features/onboarding/permissions";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const grantedSnapshot: PermissionSnapshot = {
  foreground: "granted",
  background: "granted",
  notifications: "granted",
};

describe("foregroundStateFrom", () => {
  it("maps granted / undetermined / denied", () => {
    expect(foregroundStateFrom(PermissionStatus.GRANTED)).toBe("granted");
    expect(foregroundStateFrom(PermissionStatus.UNDETERMINED)).toBe("requestable");
    expect(foregroundStateFrom(PermissionStatus.DENIED)).toBe("blocked");
  });
});

describe("backgroundStateFrom", () => {
  it("grants when the OS reports Always", () => {
    expect(backgroundStateFrom(PermissionStatus.GRANTED, PermissionStatus.GRANTED, 33)).toBe(
      "granted",
    );
  });

  it("is requestable while undetermined", () => {
    expect(backgroundStateFrom(PermissionStatus.UNDETERMINED, PermissionStatus.GRANTED, 33)).toBe(
      "requestable",
    );
  });

  it("is blocked once denied on API 29+", () => {
    expect(backgroundStateFrom(PermissionStatus.DENIED, PermissionStatus.GRANTED, 33)).toBe(
      "blocked",
    );
  });

  it("follows foreground on pre-Android-10 where 'all the time' does not exist", () => {
    expect(backgroundStateFrom(PermissionStatus.DENIED, PermissionStatus.GRANTED, 28)).toBe(
      "granted",
    );
    expect(backgroundStateFrom(PermissionStatus.DENIED, PermissionStatus.DENIED, 28)).toBe(
      "requestable",
    );
  });
});

describe("notificationsStateFrom", () => {
  it("is granted / requestable / blocked", () => {
    expect(notificationsStateFrom(true, true)).toBe("granted");
    expect(notificationsStateFrom(false, true)).toBe("requestable");
    expect(notificationsStateFrom(false, false)).toBe("blocked");
  });
});

describe("permissionsComplete", () => {
  it("requires all three rows granted", () => {
    expect(permissionsComplete(grantedSnapshot)).toBe(true);
    expect(permissionsComplete({ ...grantedSnapshot, notifications: "requestable" })).toBe(false);
    expect(permissionsComplete({ ...grantedSnapshot, background: "blocked" })).toBe(false);
  });
});

describe("nextPendingRow", () => {
  it("returns rows in the fixed request order", () => {
    expect(PERMISSION_ROW_ORDER).toEqual(["foreground", "background", "notifications"]);
  });

  it("returns the first requestable row", () => {
    expect(
      nextPendingRow({
        foreground: "granted",
        background: "requestable",
        notifications: "requestable",
      }),
    ).toBe("background");
  });

  it("returns null when everything is granted", () => {
    expect(nextPendingRow(grantedSnapshot)).toBeNull();
  });
});

describe("permissionsLost", () => {
  it("flags lost location grants but tolerates revoked notifications", () => {
    expect(
      permissionsLost({ foreground: "granted", background: "granted", notifications: "blocked" }),
    ).toBe(false);
    expect(
      permissionsLost({ foreground: "granted", background: "blocked", notifications: "granted" }),
    ).toBe(true);
    expect(
      permissionsLost({ foreground: "blocked", background: "granted", notifications: "granted" }),
    ).toBe(true);
  });
});
