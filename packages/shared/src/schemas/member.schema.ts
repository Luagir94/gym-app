import { z } from 'zod';

export const CreateMemberDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export type CreateMemberDto = z.infer<typeof CreateMemberDtoSchema>;
