import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  /** PIN de consultor (4) o contraseña de admin (6+) */
  @IsString()
  @MinLength(4)
  password!: string;
}
