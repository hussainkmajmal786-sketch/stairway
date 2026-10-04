export interface Testimonial {
  quote: string;
  name: string;
  detail: string; // year / branch
  step: string;
  photo?: string;
}

export const testimonials: Testimonial[] = [
  { quote: "I walked in not knowing what a tensor was. By lunch I had trained my first model. By evening I'd signed up for every remaining step.", name: "Akhil Sabu", detail: "S3 · Electronics", step: "Step 01 — AI Unlocked" },
  { quote: "The Pandas lab was the first time data cleaning felt like solving a mystery instead of a chore.", name: "Riya Benny", detail: "S5 · Computer Science", step: "Step 02 — Python for AI" },
  { quote: "Writing gradient descent by hand finally made the maths click. Our team won the bus-delay challenge!", name: "Sreehari K.", detail: "S7 · Computer Science", step: "Step 03 — ML from Scratch" },
  { quote: "Mentors actually sat with us and debugged. It felt less like an event and more like a lab with friends.", name: "Neha Philip", detail: "S5 · Electrical", step: "Step 03 — ML from Scratch" },
  { quote: "I came from a mechanical background and nobody made me feel out of place. The stairway really does start at the bottom.", name: "Arun Das", detail: "S3 · Mechanical", step: "Step 01 — AI Unlocked" },
  { quote: "Professional, well-paced and genuinely fun. I've been to paid bootcamps that were less organised.", name: "Merin Jose", detail: "Alumna · 2024", step: "Step 02 — Python for AI" },
];
