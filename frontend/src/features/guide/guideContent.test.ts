import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import matrix from "../employees/permissionMatrix.json";
import { ORDER_STATUS_LABEL } from "../orders/orderStatus";
import { TASK_STATUS_LABEL } from "../dispatch/taskStatus";
import { GUIDE_ROLES, GUIDES, ORDER_STATUS_HELP, screenProblems, type GuideRole } from "./content";

const YAML = readFileSync(
  resolve(import.meta.dirname, "../../../../spec/state_machines.yaml"),
  "utf8",
);

/** `label:` of every state of one machine (`<machine>:` … `states:` … until `transitions:`/`commands:`). */
function yamlStateLabels(machine: string): Record<string, string> {
  const start = YAML.indexOf(`\n${machine}:\n`);
  const block = YAML.slice(start, YAML.indexOf("\n  states:", start) + 2000);
  const states = block.slice(
    block.indexOf("states:"),
    block.search(/\n {2}(transitions|commands):/),
  );
  const labels: Record<string, string> = {};
  for (const m of states.matchAll(/^ {4}([A-Z_]+):\s*\{\s*label:\s*"?([^",]+?)"?\s*,/gm)) {
    labels[m[1] as string] = m[2] as string;
  }
  return labels;
}

function capabilitiesOf(role: GuideRole): Record<string, string[]> {
  const caps: Record<string, string[]> = {};
  for (const group of matrix.groups)
    for (const cap of group.capabilities) {
      const scope = (cap.roles as Record<string, string | undefined>)[role];
      if (scope) caps[cap.id] = [scope];
    }
  return caps;
}

describe("AC-HELP-007 nội dung hướng dẫn khớp quyền và trạng thái", () => {
  test("AC-HELP-007 mọi màn hình mỗi mục khai báo đều nằm trong menu vai trò đó nhìn thấy", () => {
    for (const role of GUIDE_ROLES) {
      const guide = GUIDES[role];
      expect(guide.sections.length).toBeGreaterThan(0);
      for (const section of guide.sections) expect(section.screens.length).toBeGreaterThan(0);
      expect(screenProblems(guide, capabilitiesOf(role))).toEqual([]);
    }
  });

  test("AC-HELP-007 mục nhắc tới màn hình vai trò không vào được → báo lỗi đúng mục", () => {
    const tech = GUIDES.TECHNICIAN;
    const leaky = {
      ...tech,
      sections: [
        ...tech.sections,
        { id: "lo-quyen", title: "Nhân sự", steps: ["Mở trang Nhân sự."], screens: ["/employees"] },
      ],
    };
    expect(screenProblems(leaky, capabilitiesOf("TECHNICIAN"))).toEqual([
      { section: "lo-quyen", screen: "/employees" },
    ]);
  });

  test("AC-HELP-007 nhãn trạng thái đơn/đầu việc dùng trong hướng dẫn khớp state_machines.yaml", () => {
    const orderLabels = yamlStateLabels("order");
    expect(Object.keys(orderLabels)).toHaveLength(7);
    expect(ORDER_STATUS_LABEL).toEqual(orderLabels);
    expect(Object.keys(ORDER_STATUS_HELP).sort()).toEqual(Object.keys(orderLabels).sort());
    for (const help of Object.values(ORDER_STATUS_HELP))
      expect(help.trim().length).toBeGreaterThan(10);
    const taskLabels = yamlStateLabels("task");
    expect(Object.keys(taskLabels)).toHaveLength(6);
    expect(TASK_STATUS_LABEL).toEqual(taskLabels);
  });
});
