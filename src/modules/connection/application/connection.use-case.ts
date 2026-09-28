import { Injectable } from '@nestjs/common';
import { ConnectionService } from '../services/connection.service';
import { ConnectionCreateDto } from '../dtos/ConnectionCreateDto';
import { ResponseModel } from 'src/shared/models/ResponseModel';
import { ConnectionResponseDto } from '../dtos/ConnectionResponseDto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConnectionOauthCallbackDto } from '../dtos/ConnectionOauthCallbackDto';

@Injectable()
export class ConnectionUseCase {
	constructor(
		private readonly connectionService: ConnectionService,
		private readonly httpService: HttpService,
	) {}

	private async getConnectionQuery(fn: () => Promise<ConnectionResponseDto | null>): Promise<ResponseModel<ConnectionResponseDto>> {
		const response = new ResponseModel<ConnectionResponseDto>();

		try {
			const connection = await fn();

			response.data = connection;
			response.message = 'Consulta realizada com sucesso!';

			if (!connection) {
				response.message = 'Conexão com o whatsapp não localizada!';
				response.success = false;
			}
		} catch (error) {
			console.log(error);

			response.message = 'Ocorreu um erro ao consultar conexão com o whatsapp!';
			response.success = false;
		}

		return response;
	}

	async processOauthCallback(dto: ConnectionOauthCallbackDto): Promise<ResponseModel<ConnectionResponseDto>> {
		const response = new ResponseModel<ConnectionResponseDto>();

		const version = process.env.CLOUD_API_VERSION || 'v25.0';
		const appId = process.env.META_APP_ID;
		const appSecret = process.env.TOKEN_APP_META;

		if (!appId || !appSecret) {
			response.success = false;
			response.message = 'META_APP_ID/TOKEN_APP_META não configurados nesta instância do whatsapp_api.';

			console.error('[ConnectionUseCase] oauth-callback abortado: META_APP_ID ou TOKEN_APP_META ausentes no ambiente.');

			return response;
		}

		console.log(
			`[ConnectionUseCase] oauth-callback recebido | waba_id=${dto.waba_id} | connection_name=${dto.connection_name ?? '(default)'} | phone_number_id=${dto.phone_number_id ?? '(não informado)'}`,
		);

		try {
			const tokenUrl = `https://graph.facebook.com/${version}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${dto.code}`;

			const tokenRes = await firstValueFrom(this.httpService.post(tokenUrl));
			const userToken = tokenRes.data?.access_token;

			if (!userToken) {
				throw new Error('A Meta não retornou access_token na troca do code.');
			}

			// O phone_number_id vindo do Embedded Signup é a fonte confiável. A consulta a
			// /{waba_id}/phone_numbers é apenas fallback: no onboarding de coexistência ela
			// pode responder lista vazia enquanto o número ainda está sendo provisionado.
			const phoneId = dto.phone_number_id?.trim() || (await this.resolvePhoneId(version, dto.waba_id, userToken));

			const webhookUrl = `https://graph.facebook.com/${version}/${dto.waba_id}/subscribed_apps`;
			await firstValueFrom(
				this.httpService.post(
					webhookUrl,
					{},
					{
						headers: { Authorization: `Bearer ${userToken}` },
					},
				),
			);

			const createDto: ConnectionCreateDto = {
				connection_name: dto.connection_name || 'Nova Conexão Embedded',
				user_token: userToken,
				waba_id: dto.waba_id,
				phone_id: phoneId,
			} as ConnectionCreateDto;

			const connection = await this.connectionService.upsertByPhoneId(createDto);

			console.log(
				`[ConnectionUseCase] Conexão persistida | id=${connection.id} | phone_id=${connection.phone_id} | waba_id=${connection.waba_id} | connection_name=${connection.connection_name}`,
			);

			response.data = connection;
			response.message = 'Conexão efetuada com sucesso!';

			return response;
		} catch (error: any) {
			const detail = error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'erro desconhecido';

			console.error('[ConnectionUseCase] Falha no oauth-callback:', error?.response?.data || error);

			response.success = false;
			response.message = `Falha ao processar o login com o Facebook: ${detail}`;

			return response;
		}
	}

	/**
	 * Descobre o phone_number_id consultando a WABA.
	 * Usado apenas quando o cliente não envia o phone_number_id do Embedded Signup.
	 */
	private async resolvePhoneId(version: string, wabaId: string, userToken: string): Promise<string> {
		const phoneUrl = `https://graph.facebook.com/${version}/${wabaId}/phone_numbers?fields=id&access_token=${userToken}`;
		const phoneRes = await firstValueFrom(this.httpService.get(phoneUrl));
		const phoneId = phoneRes.data?.data?.[0]?.id;

		if (!phoneId) {
			throw new Error(
				`A WABA ${wabaId} não retornou nenhum número de telefone. Envie o phone_number_id do evento WA_EMBEDDED_SIGNUP no callback ou refaça a conexão após o número ser provisionado.`,
			);
		}

		return phoneId;
	}

	async create(dto: ConnectionCreateDto): Promise<ResponseModel<ConnectionResponseDto>> {
		const response = new ResponseModel<ConnectionResponseDto>();

		try {
			// Idempotente por phone_id: recriar a conexão de um número já cadastrado
			// atualiza o registro (inclusive o user_token) em vez de falhar com P2002.
			const createdConnection = await this.connectionService.upsertByPhoneId(dto);

			response.data = createdConnection;
			response.message = 'Conexão efetuada com sucesso!';
		} catch (error) {
			const err = error as any;

			response.message = err.message || 'Ocorreu um erro ao criar conexão com o whatsapp!';
			response.success = false;

			console.log(error);
		}

		return response;
	}

	async gelAll(): Promise<ResponseModel<ConnectionResponseDto[]>> {
		const response = new ResponseModel<ConnectionResponseDto[]>();

		try {
			const connections = await this.connectionService.getAll();

			response.data = connections;
			response.message = 'Consulta realizada com sucesso!';
		} catch (error) {
			const err = error as any;

			response.message = 'Ocorreu um erro ao consultar conexões com o whatsapp!';
			response.success = false;

			console.log(error);
		}

		return response;
	}

	async getById(id: number): Promise<ResponseModel<ConnectionResponseDto>> {
		return this.getConnectionQuery(() => this.connectionService.getById(id));
	}

	async getByConnectionName(connection_name: string): Promise<ResponseModel<ConnectionResponseDto>> {
		return this.getConnectionQuery(() => this.connectionService.getByConnectionName(connection_name));
	}

	async getByUserToken(user_token: string): Promise<ResponseModel<ConnectionResponseDto>> {
		return this.getConnectionQuery(() => this.connectionService.getByUserToken(user_token));
	}

	async getByPhoneId(phone_id: string): Promise<ResponseModel<ConnectionResponseDto>> {
		return this.getConnectionQuery(() => this.connectionService.getByPhoneId(phone_id));
	}

	async getByWabaId(waba_id: string): Promise<ResponseModel<ConnectionResponseDto>> {
		return this.getConnectionQuery(() => this.connectionService.getByWabaId(waba_id));
	}

	async disconnect(id: number): Promise<ResponseModel<null>> {
		const response = new ResponseModel<null>();

		try {
			const connection = await this.connectionService.getById(id);
			if (!connection) {
				response.success = false;
				response.message = 'Conexão não encontrada.';
				return response;
			}

			await this.connectionService.delete(id);

			response.success = true;
			response.message = 'Conexão desconectada e removida com sucesso.';
			response.data = null;
		} catch (error: any) {
			console.log('Erro interno ao desconectar:', error);
			response.success = false;
			response.message = 'Ocorreu um erro interno ao processar a desconexão.';
		}

		return response;
	}
}
