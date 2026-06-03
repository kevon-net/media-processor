import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';

describe('Authentication Flow (Integration)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  const uniqueId = Date.now();
  const testEmail = `user-${uniqueId}@example.com`;
  const testPassword = 'securePassword123';
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Crucial: Enforce identical validation rules as your live server
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data to keep the database pristine
    try {
      await prismaService.user.delete({
        where: { email: testEmail },
      });
    } catch (e) {
      // User might not have been created if tests failed
    }
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should successfully create a user and return a JWT access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(typeof response.body.access_token).toBe('string');
    });

    it('should reject registration requests with short passwords', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `fail-${uniqueId}@example.com`,
          password: '123', // Below validation length limits
        })
        .expect(400);

      expect(response.body.message).toContain(
        'Password must be at least 6 characters long'
      );
    });

    it('should throw a 409 Conflict if registration email is a duplicate', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: testEmail, // Re-submitting the original email
          password: testPassword,
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate a valid user and return a clean bearer token string', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      jwtToken = response.body.access_token; // Save token for protected route testing
    });

    it('should reject login requests with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'wrongPassword',
        })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should grant access to authenticated user profile via JWT Bearer headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('email', testEmail);
      expect(response.body).not.toHaveProperty('passwordHash'); // Verify payload sanitation
    });

    it('should deny profile access if authorization token headers are omitted', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });
});
