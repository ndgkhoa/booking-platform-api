import { OWNER_ONLY } from '@common/types';
import { CreateWebhookDto } from '@modules/webhook/dto/create-webhook.dto';
import { WebhookService } from '@modules/webhook/webhook.service';
import {
  Authorized,
  Body,
  Delete,
  Get,
  HttpCode,
  JsonController,
  Param,
  Post,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/webhooks')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get()
  @Authorized(OWNER_ONLY)
  list() {
    return this.webhooks.list();
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  create(@Body() dto: CreateWebhookDto) {
    return this.webhooks.create(dto);
  }

  @Delete('/:id')
  @Authorized(OWNER_ONLY)
  async remove(@Param('id') id: string) {
    await this.webhooks.remove(id);
    return { success: true };
  }
}
