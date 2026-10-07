import type { Question } from "@/lib/registration/questions";

export interface RegistrationSeed {
  ticketType?: "qr" | "token";
  questions?: Question[];
  /** ISO timestamp with offset; registration is open until the session starts unless set. */
  opensAt?: string;
}

// Per-event registration settings. Events not listed: QR ticket, no questions, open until the session starts.
export const REGISTRATION_CONFIG: Record<string, RegistrationSeed> = {
  "seeing-machines": {
    questions: [
      { id: "laptop", label: "Will you bring a laptop?", type: "single_choice", options: ["Yes", "No"], required: true },
      {
        id: "goal", label: "What would you like to build with computer vision?",
        help: "Optional. Helps the speakers tailor the lab.", type: "textarea", required: false,
      },
    ],
  },
  "wie-ai-healthtech": {
    ticketType: "token",
    questions: [
      { id: "kit_size", label: "T-shirt size for the welcome kit", type: "single_choice", options: ["S", "M", "L", "XL"], required: true },
      { id: "photo_consent", label: "Happy to appear in event photos", type: "checkbox", required: false },
    ],
  },
  "deep-learning-decoded": {
    questions: [
      {
        id: "frameworks", label: "Which frameworks have you used?", type: "multi_choice",
        options: ["PyTorch", "TensorFlow", "Keras", "JAX", "None yet"], required: false,
      },
    ],
  },
  "language-and-machines": { opensAt: "2026-10-20T09:00:00+05:30" },
};
