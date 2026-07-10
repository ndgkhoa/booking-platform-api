import { IsString, MaxLength } from 'class-validator';

export class CreateWebhookDto {
  // Format/https/SSRF checks live in assertSafeWebhookUrl (single authority → 400).
  @IsString()
  @MaxLength(2048)
  url!: string;
}
