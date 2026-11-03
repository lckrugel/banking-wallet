export class LoginResponseDto {
  accessToken!: string;
  tokenType!: 'Bearer';
  expiresIn!: number;
}
