import { AccessTokenResponse, InviteCodeResponse } from '@grimoire-os/shared';

describe('Shared response types', () => {
  it('AccessTokenResponse has access_token field', () => {
    const response: AccessTokenResponse = { access_token: 'jwt-token-123' };
    expect(response.access_token).toBe('jwt-token-123');
  });

  it('InviteCodeResponse has inviteCode field', () => {
    const response: InviteCodeResponse = { inviteCode: 'ABC123' };
    expect(response.inviteCode).toBe('ABC123');
  });
});
