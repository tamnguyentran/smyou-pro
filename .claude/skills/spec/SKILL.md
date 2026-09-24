---
name: spec
description: Draft a feature spec with machine-checkable Acceptance Criteria for a backlog item (e.g. /spec M3-02). Produces docs/specs/<ID>-<slug>.md in Draft status and stops for the product owner's approval. Use before any implementation.
disable-model-invocation: true
argument-hint: <backlog-ID>
---

# /spec $ARGUMENTS

Goal: turn backlog item `$ARGUMENTS` into a spec the owner can approve in ~10 minutes. **Do not write code.**

1. Read `docs/backlog/BACKLOG.md` for the item; read `docs/specs/_TEMPLATE.md`.
2. Read only what the item needs: relevant parts of `spec/state_machines.yaml`, `spec/permissions.yaml`, `docs/product/DOMAIN_MODEL.md`, `WORKFLOWS.md`, `PERMISSIONS.md`, `GLOSSARY.md`, `OPEN_QUESTIONS.md`, `docs/design/UI_GUIDELINES.md`, and existing specs of items it depends on.
3. Create `docs/specs/$ARGUMENTS-<kebab-slug>.md` from the template, `Status: Draft`. Acceptance Criteria:
   - Prefix per module (see BACKLOG.md), numbered continuing from the highest existing number for that prefix (`grep -rhoE "AC-<PFX>-[0-9]{3}" docs/specs`).
   - Concrete data (real-looking Vietnamese names, amounts from the reference quotes), explicit actor role, observable result (HTTP code + error `code`, resulting state, audit/notification, UI text).
   - Cover: happy path; every guard failure; every role that must be denied (403 or 404 per scope rule); invalid state (409); validation (422); concurrency/`STALE_VERSION` for commands; mobile vs desktop UI where relevant.
   - Tag each AC with test layer(s): unit / integration / generated / stateful / component / e2e.
4. Do not invent business rules. Anything not covered by the docs → add to §8 and append a row to `docs/product/OPEN_QUESTIONS.md` (this file is permission-protected; the user will be asked) with a proposed default.
5. If the item needs a change to `spec/*.yaml`, show the proposed YAML diff in §8 — do not edit the YAML yet.
6. Update the backlog marker to `[S]`.
7. Reply to the user in Vietnamese with: link to the spec, number of ACs, the list of assumptions/questions needing their decision, and: "Duyệt bằng cách sửa `Status: Approved` (hoặc bảo tôi đổi) rồi chạy `/implement $ARGUMENTS`."
