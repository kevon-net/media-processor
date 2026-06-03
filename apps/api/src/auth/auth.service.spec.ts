import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtMock: any;

  beforeEach(async () => {
    // Build functional stubs for database interactions
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    jwtMock = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should successfully hash passwords and return an access token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // No existing user
      prismaMock.user.create.mockResolvedValue({
        id: 'user-123',
        email: 'jest@example.com',
      });

      const result = await service.register({
        email: 'jest@example.com',
        password: 'password123',
      });

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'jest@example.com',
          }),
        })
      );
    });

    it('should throw a ConflictException if email is already taken', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-123' });

      await expect(
        service.register({ email: 'jest@example.com', password: 'password123' })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'fake@example.com', password: 'password123' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password verification fails', async () => {
      const complexHash = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        email: 'jest@example.com',
        passwordHash: complexHash,
      });

      await expect(
        service.login({ email: 'jest@example.com', password: 'wrong-password' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
