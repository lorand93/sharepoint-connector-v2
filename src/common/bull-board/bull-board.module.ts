import { Module } from '@nestjs/common';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullModule } from '@nestjs/bullmq';
import { QueueModule } from '../../queue/queue.module';
import { BullBoardModule as NestBullBoardModule } from "@bull-board/nestjs";

@Module({
  imports: [
    QueueModule,
    NestBullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter
    }),
    NestBullBoardModule.forFeature({
      name: 'sharepoint-tasks',
      adapter: BullMQAdapter,
    }),
  ],
})
export class BullBoardModule {
}
