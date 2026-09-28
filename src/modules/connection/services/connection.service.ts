import { Injectable } from '@nestjs/common';
import { DbService } from 'src/infrastructure/database/prisma/prisma.service';
import { ConnectionCreateDto } from '../dtos/ConnectionCreateDto';
import { ConnectionResponseDto } from '../dtos/ConnectionResponseDto';

@Injectable()
export class ConnectionService {
	constructor(private readonly db: DbService) {}

	/**
	 * Grava a conexão de forma idempotente, usando o phone_id como identidade.
	 *
	 * Uma reconexão (novo Embedded Signup do mesmo número) sempre gera um novo
	 * user_token e pode reaproveitar o mesmo connection_name/waba_id. Como esses
	 * três campos são @unique no schema, um `create` puro falha com P2002 e a
	 * conexão nunca chega a ser propagada. Por isso os registros antigos que
	 * colidiriam (mesmo nome/token/waba em OUTRO phone_id) são removidos antes
	 * do upsert.
	 */
	async upsertByPhoneId(dto: ConnectionCreateDto): Promise<ConnectionResponseDto> {
		const connection = await this.db.$transaction(async (tx) => {
			await tx.connections.deleteMany({
				where: {
					phone_id: { not: dto.phone_id },
					OR: [{ connection_name: dto.connection_name }, { user_token: dto.user_token }, { waba_id: dto.waba_id }],
				},
			});

			return tx.connections.upsert({
				where: { phone_id: dto.phone_id },
				update: {
					connection_name: dto.connection_name,
					user_token: dto.user_token,
					waba_id: dto.waba_id,
				},
				create: {
					connection_name: dto.connection_name,
					user_token: dto.user_token,
					phone_id: dto.phone_id,
					waba_id: dto.waba_id,
				},
			});
		});

		return new ConnectionResponseDto(connection);
	}

	async getAll(): Promise<ConnectionResponseDto[]> {
		const connections = await this.db.connections.findMany();

		return connections.map((c) => new ConnectionResponseDto(c));
	}

	async getById(id: number): Promise<ConnectionResponseDto | null> {
		const connection = await this.db.connections.findUnique({ where: { id } });
		if (!connection) return null;

		return new ConnectionResponseDto(connection);
	}

	async getByConnectionName(connection_name: string): Promise<ConnectionResponseDto | null> {
		const connection = await this.db.connections.findUnique({ where: { connection_name } });
		if (!connection) return null;

		return new ConnectionResponseDto(connection);
	}

	async getByUserToken(user_token: string): Promise<ConnectionResponseDto | null> {
		const connection = await this.db.connections.findUnique({ where: { user_token } });
		if (!connection) return null;

		return new ConnectionResponseDto(connection);
	}

	async getByPhoneId(phone_id: string): Promise<ConnectionResponseDto | null> {
		const connection = await this.db.connections.findUnique({ where: { phone_id } });
		if (!connection) return null;

		return new ConnectionResponseDto(connection);
	}

	async getByWabaId(waba_id: string): Promise<ConnectionResponseDto | null> {
		const connection = await this.db.connections.findUnique({ where: { waba_id } });
		if (!connection) return null;

		return new ConnectionResponseDto(connection);
	}

	async delete(id: number): Promise<void> {
		await this.db.connections.delete({ where: { id } });
	}
}
