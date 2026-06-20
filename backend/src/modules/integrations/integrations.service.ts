import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class IntegrationsService {
  private genai: GoogleGenerativeAI | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('GEMINI_API_KEY');
    if (key) this.genai = new GoogleGenerativeAI(key);
  }

  jobs() {
    return this.dataSource.query(
      'SELECT * FROM integration_jobs ORDER BY created_at DESC LIMIT 50',
    );
  }

  queueGovernmentPush(
    type: 'DIGILOCKER' | 'NAD' | 'ABC',
    entityType: string,
    entityId?: string,
  ) {
    return this.dataSource.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, entity_id, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', $1, $2, $3, '{}'::jsonb)
       RETURNING *`,
      [type, entityType, entityId ?? null],
    );
  }

  moodleSsoToken(userId: string, email: string) {
    const base = this.config.get(
      'MOODLE_SSO_URL',
      'https://lms.example.edu/auth/oauth2/login.php',
    );
    const token = Buffer.from(
      JSON.stringify({ sub: userId, email, ts: Date.now() }),
    ).toString('base64url');
    return {
      redirect_url: `${base}?falcon_token=${token}`,
      expires_in: 300,
      note: 'Configure MOODLE_SSO_URL and OAuth client in production',
    };
  }

  async studentFaqChat(question: string) {
    if (!this.genai) {
      return {
        answer:
          'Minimum attendance required is 75% as per university ordinances. Configure GEMINI_API_KEY for live AI answers.',
      };
    }
    const model = this.genai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const docs = await this.dataSource.query(
      `SELECT title, folder FROM global_policy_documents LIMIT 10`,
    );
    const context = (docs as Array<{ title: string; folder: string }>)
      .map((d) => `${d.folder}: ${d.title}`)
      .join('\n');
    const result = await model.generateContent(
      `You are Falcon Campus assistant for SGVU students. Use only this policy context:\n${context}\n\nQuestion: ${question}`,
    );
    return { answer: result.response.text() };
  }
}
