import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  /** PIN de consultor (4) o contraseña de admin (6+) */
  @IsString()
  @MinLength(4)
  password!: string;
}
