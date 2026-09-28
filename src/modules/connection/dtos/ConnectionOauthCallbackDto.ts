import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConnectionOauthCallbackDto {
	@ApiProperty({ description: 'O código de autorização retornado pelo Facebook Login' })
	@IsString()
	@IsNotEmpty()
	code!: string;

	@ApiProperty({ description: 'ID da conta de WhatsApp Business (WABA)' })
	@IsString()
	@IsNotEmpty()
	waba_id!: string;

	@ApiPropertyOptional({ description: 'Nome opcional para a conexão', default: 'Nova Conexão Embedded' })
	@IsString()
	@IsOptional()
	connection_name?: string;

	@ApiPropertyOptional({
		description:
			'ID do número devolvido pela Meta no evento WA_EMBEDDED_SIGNUP. Quando informado evita a consulta a /{waba_id}/phone_numbers, que pode vir vazia logo após o onboarding (fluxo de coexistência).',
	})
	@IsString()
	@IsOptional()
	phone_number_id?: string;
}
