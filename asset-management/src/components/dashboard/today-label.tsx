"use client";

import { useEffect, useState } from "react";

function formatToday() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function TodayLabel() {
  const [label, setLabel] = useState(formatToday);

  useEffect(() => {
    const id = setInterval(() => setLabel(formatToday()), 60_000);
    return () => clearInterval(id);
  }, []);

  return <p className="text-sm font-medium text-blue-100">{label}</p>;
}
