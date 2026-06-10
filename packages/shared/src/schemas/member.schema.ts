import { z } from 'zod';

export const CreateMemberDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export type CreateMemberDto = z.infer<typeof CreateMemberDtoSchema>;

export const MemberResponseDtoSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.date().or(z.string().datetime()),
});

export type MemberResponseDto = z.infer<typeof MemberResponseDtoSchema>;
