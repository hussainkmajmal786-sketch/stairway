import { describe, expect, it } from "vitest";
import { fieldDescribedBy } from "@/components/ui/Field";
import { FORM_ERROR_ID, fieldOrder, firstInvalid, formLevelError, submitGate } from "@/lib/registration/form";

const order = fieldOrder(["laptop", "level"]);

describe("registration form helpers", () => {
  it("orders registrant fields, then questions, then the form-level error", () => {
    expect(order).toEqual(["fullName", "college", "branch", "year", "phone", "ieeeMemberId", "q-laptop", "q-level", "form"]);
  });

  it("submits only when there are no client errors", () => {
    expect(submitGate({}, order)).toEqual({ submit: true });
    expect(submitGate({ "q-level": "Pick one", phone: "Bad" }, order)).toEqual({ submit: false, focusId: "phone" });
  });

  it("blocks a submit whose only error has no field (form-level or stray key)", () => {
    expect(submitGate({ form: "The answers are too long in total." }, order)).toEqual({ submit: false, focusId: FORM_ERROR_ID });
    expect(submitGate({ "q-gone": "x" }, order)).toEqual({ submit: false, focusId: FORM_ERROR_ID });
  });

  it("finds the first invalid id and the form-level message", () => {
    expect(firstInvalid({}, order)).toBeNull();
    expect(firstInvalid({ "q-level": "x", "q-laptop": "y" }, order)).toBe("q-laptop");
    expect(formLevelError({ phone: "x" }, order)).toBeUndefined();
    expect(formLevelError({ phone: "x", form: "Too long" }, order)).toBe("Too long");
    expect(formLevelError({ "q-gone": "Stale" }, order)).toBe("Stale");
  });

  it("describes a field by its error, else its hint", () => {
    expect(fieldDescribedBy("phone", { error: "Bad", hint: "Private" })).toBe("phone-err");
    expect(fieldDescribedBy("phone", { hint: "Private" })).toBe("phone-hint");
    expect(fieldDescribedBy("phone", {})).toBeUndefined();
  });
});
