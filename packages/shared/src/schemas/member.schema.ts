import { z } from 'zod';

export const CreateMemberDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const MemberResponseDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  tenantId: z.string(),
  createdAt: z.coerce.date(),
});

export type CreateMemberDto = z.infer<typeof CreateMemberDtoSchema>;
export type MemberResponseDto = z.infer<typeof MemberResponseDtoSchema>;
