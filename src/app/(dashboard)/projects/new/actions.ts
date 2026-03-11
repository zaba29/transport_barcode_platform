"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserContext } from "@/lib/domain/queries";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2, "Project name is required"),
  projectType: z.enum(["stock_check", "loading_check"]),
  description: z.string().trim().optional(),
});

export async function createProjectAction(formData: FormData) {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid project payload");
  }

  const supabase = await createClient();
  const context = await getUserContext();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: context.organizationId,
      name: parsed.data.name,
      project_type: parsed.data.projectType,
      description: parsed.data.description || null,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  redirect(`/projects/${data.id}`);
}
