"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function currentGreeting() {
  return greetingForHour(new Date().getHours());
}

export function GreetingLabel() {
  const [greeting, setGreeting] = useState(currentGreeting);

  useEffect(() => {
    const id = setInterval(() => setGreeting(currentGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  return <>{greeting}</>;
}
