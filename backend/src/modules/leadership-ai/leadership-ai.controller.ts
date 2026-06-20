import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FinancialGeminiService } from './financial-gemini.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/leadership/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Chairman', 'President', 'SuperAdmin')
export class LeadershipAiController {
  constructor(
    private readonly gemini: FinancialGeminiService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Post('chat')
  chat(@Req() req: { user: AuthUser }, @Body() body: { question: string }) {
    return this.gemini.chat(this.tenant(req), body.question);
  }

  @Post('delta-analysis')
  deltaAnalysis(@Req() req: { user: AuthUser }) {
    return this.gemini.deltaAnalysis(this.tenant(req));
  }

  @Post('scenario')
  scenario(
    @Req() req: { user: AuthUser },
    @Body() body: { admissions_drop_pct?: number },
  ) {
    return this.gemini.scenarioPlanning(
      this.tenant(req),
      body.admissions_drop_pct ?? 15,
    );
  }

  @Get('forecast')
  async forecast(@Req() req: { user: AuthUser }) {
    const tid = this.tenant(req);
    const rows = await this.db.query(
      `SELECT horizon_days, projected_balance, assumptions, forecast_date
       FROM cash_flow_forecasts
       WHERE tenant_id = $1 AND forecast_date = (SELECT MAX(forecast_date) FROM cash_flow_forecasts WHERE tenant_id = $1)
       ORDER BY horizon_days`,
      [tid, tid],
    );
    return rows.map(
      (r: {
        horizon_days: number;
        projected_balance: string;
        assumptions: unknown;
        forecast_date: string;
      }) => ({
        horizon_days: r.horizon_days,
        projected_balance: Number(r.projected_balance),
        assumptions: r.assumptions,
        forecast_date: r.forecast_date,
      }),
    );
  }
}
