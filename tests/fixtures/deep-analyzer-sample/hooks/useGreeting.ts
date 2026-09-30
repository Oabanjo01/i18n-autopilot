import { useState } from "react";

// Scenario: hook files — string initial values of useState are extracted
export function useGreeting() {
  const [greeting, setGreeting] = useState("Welcome back");
  const [status] = useState("idle");
  return { greeting, setGreeting, status };
}
