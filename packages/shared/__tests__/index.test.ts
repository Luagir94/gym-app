import * as shared from '../src/index';

describe('@gym/shared barrel', () => {
  it('exports are defined', () => {
    expect(shared).toBeDefined();
  });

  it('exports CreateMemberDtoSchema', () => {
    expect(shared.CreateMemberDtoSchema).toBeDefined();
  });

  it('validates a correct CreateMemberDto', () => {
    const result = shared.CreateMemberDtoSchema.safeParse({
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email in CreateMemberDto', () => {
    const result = shared.CreateMemberDtoSchema.safeParse({
      email: 'not-an-email',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });
});
