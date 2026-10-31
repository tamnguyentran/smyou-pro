import { describe, expect, test } from "vitest";
import matrix from "./permissionMatrix.json";
import { CAPABILITY_LABELS, labelProblems } from "./permissionLabels";

describe("AC-EMP-081 nhãn tiếng Việt cho mọi quyền", () => {
  test("AC-EMP-081 mọi capability trong permissionMatrix.json có nhãn, không có nhãn thừa", () => {
    expect(labelProblems(matrix)).toEqual({ missing: [], extra: [] });
    for (const label of Object.values(CAPABILITY_LABELS)) expect(label.trim()).not.toBe("");
  });
});

describe("AC-EMP-090 thêm quyền mới mà quên nhãn thì test đỏ", () => {
  test("AC-EMP-090 ma trận có thêm capability giả → báo thiếu nhãn đúng capability đó", () => {
    const [first, ...rest] = matrix.groups;
    if (!first) throw new Error("permissionMatrix.json không có nhóm nào");
    const withFake = {
      ...matrix,
      groups: [
        {
          ...first,
          capabilities: [...first.capabilities, { id: "catalog.fake", roles: { MANAGER: "all" } }],
        },
        ...rest,
      ],
    };
    expect(labelProblems(withFake)).toEqual({ missing: ["catalog.fake"], extra: [] });
  });

  test("AC-EMP-090 bỏ một capability khỏi ma trận → nhãn của nó bị báo thừa", () => {
    const withoutAudit = {
      ...matrix,
      groups: matrix.groups.map((g) => ({
        ...g,
        capabilities: g.capabilities.filter((c) => c.id !== "audit.read"),
      })),
    };
    expect(labelProblems(withoutAudit)).toEqual({ missing: [], extra: ["audit.read"] });
  });
});
