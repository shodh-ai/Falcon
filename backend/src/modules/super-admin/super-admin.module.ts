import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Campus } from '../../entities/campus.entity';
import { School } from '../../entities/school.entity';
import { Program } from '../../entities/program.entity';
import { Department } from '../../entities/department.entity';
import { Batch } from '../../entities/batch.entity';
import { AuthModule } from '../../auth/auth.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campus, School, Program, Department, Batch]),
    JwtModule.register({}),
    AuthModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, ImpersonationService],
  exports: [SuperAdminService, ImpersonationService],
})
export class SuperAdminModule {}
