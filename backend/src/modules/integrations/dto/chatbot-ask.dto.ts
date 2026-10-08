import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatbotAskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;
}
