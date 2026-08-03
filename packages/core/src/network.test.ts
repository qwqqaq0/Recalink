import { describe, expect, it } from "vitest";
import { assertPublicAddress } from "./network.js";

describe("assertPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.4",
    "172.16.8.1",
    "192.168.1.20",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1"
  ])("rejects private or special address %s", (address) => {
    expect(() => assertPublicAddress(address)).toThrow(
      "不允许访问私有或特殊网络地址"
    );
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(() => assertPublicAddress(address)).not.toThrow();
    }
  );
});
