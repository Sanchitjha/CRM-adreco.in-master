import { z } from "zod";

export const TASK_STATUS_VALUES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const TASK_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  assignedToId: z.string().trim().min(1, "Choose who this is for"),
  dueDate: z.string().trim().optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  leadId: z.string().trim().optional(),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUS_VALUES),
});
