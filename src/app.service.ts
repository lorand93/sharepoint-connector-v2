import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly redisUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.get('redis.url', '');
  }

  getHello(): string {
    console.log(this.redisUrl);
    return 'Hello World!';
  }
}
