import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';
import { AuthGuard } from './auth.guard';
import { User } from './user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: AuthDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: AuthDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@User() user: { sub: string }) {
    return this.authService.getUser(user.sub);
  }
}
