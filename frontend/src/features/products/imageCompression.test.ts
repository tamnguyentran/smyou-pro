import { describe, expect, test } from "vitest";
import { computeResizedDimensions, MAX_FILE_BYTES, validateImageFile } from "./imageCompression";

function file(bytes: number, type: string, name = "photo.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("AC-CAT-016 validateImageFile: lỗi tức thì, không gọi API nén/tải", () => {
  test("ảnh hợp lệ → không lỗi", () => {
    expect(validateImageFile(file(1024, "image/jpeg"))).toBeNull();
  });

  test("không phải ảnh → INVALID_FILE_TYPE, thông điệp khớp server (files/domain.py)", () => {
    expect(validateImageFile(file(1024, "text/plain"))).toEqual({
      code: "INVALID_FILE_TYPE",
      message: "Tệp không phải ảnh hợp lệ.",
    });
  });

  test("> 10MB → FILE_TOO_LARGE, thông điệp khớp server", () => {
    expect(validateImageFile(file(MAX_FILE_BYTES + 1, "image/jpeg"))).toEqual({
      code: "FILE_TOO_LARGE",
      message: "Ảnh vượt quá 10MB.",
    });
  });

  test("đúng 10MB vẫn hợp lệ (biên)", () => {
    expect(validateImageFile(file(MAX_FILE_BYTES, "image/jpeg"))).toBeNull();
  });
});

describe("AC-CAT-016 computeResizedDimensions: cạnh dài ≤ 2000px, giữ tỉ lệ", () => {
  test("ảnh đã nhỏ hơn giới hạn → giữ nguyên", () => {
    expect(computeResizedDimensions(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  test("cạnh ngang dài hơn → thu theo chiều ngang, giữ tỉ lệ", () => {
    expect(computeResizedDimensions(4000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  test("cạnh dọc dài hơn → thu theo chiều dọc, giữ tỉ lệ", () => {
    expect(computeResizedDimensions(2000, 4000)).toEqual({ width: 1000, height: 2000 });
  });

  test("đúng bằng giới hạn → giữ nguyên", () => {
    expect(computeResizedDimensions(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });
});
