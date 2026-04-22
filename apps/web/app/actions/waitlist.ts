"use server";

import { getEnv } from "@/lib/env";

export type WaitlistState = {
  success?: boolean;
  error?: string;
};

export async function joinWaitlist(prevState: WaitlistState, formData: FormData): Promise<WaitlistState> {
  // Capture data as simply as possible
  const rawData: Record<string, any> = {};
  
  // Next.js sometimes prefixes keys, let's find our fields regardless
  formData.forEach((value, key) => {
    if (key.includes("email")) rawData.email = value;
    if (key.includes("name")) rawData.name = value;
    if (key.includes("company")) rawData.company = value;
    if (key.includes("role")) rawData.role = value;
  });

  if (!rawData.email) {
    return { error: "Please provide a valid email address." };
  }

  try {
    const env = getEnv();
    const apiBase = env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
    const endpoint = `${apiBase.replace(/\/$/, "")}/public/waitlist`;
    // If apiBase is .../api, it becomes .../api/public/waitlist

    console.log("Sending waitlist data to:", endpoint, rawData);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rawData),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Worker error:", errorText);
      return { error: "Failed to join. We've logged this and will fix it!" };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Waitlist connection error:", error);
    return { error: "Service temporarily unavailable. Please try again in a bit!" };
  }
}
