import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DeceasedModule } from './modules/deceased/deceased.module';
import { RelativesModule } from './modules/relatives/relatives.module';
import { CasesModule } from './modules/cases/cases.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { KpisModule } from './modules/kpis/kpis.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { NotesModule } from './modules/notes/notes.module';
import { AuditModule } from './modules/audit/audit.module';
import { KinshipModule } from './modules/kinship/kinship.module';
import { JwtAuthGuard, RolesGuard } from './common/guards/auth.guards';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DeceasedModule,
    RelativesModule,
    CasesModule,
    DocumentsModule,
    TasksModule,
    DashboardModule,
    ReportsModule,
    KpisModule,
    CalendarModule,
    CommunicationsModule,
    RepositoryModule,
    NotesModule,
    KinshipModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
