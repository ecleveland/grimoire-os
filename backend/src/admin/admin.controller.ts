import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../prisma/enums";
import { UsersService } from "../users/users.service";
import { AdminUpdateUserDto } from "../users/dto/admin-update-user.dto";

@ApiTags("Admin")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get("users")
  @ApiOperation({ summary: "List all users (admin only)" })
  findAllUsers() {
    return this.usersService.findAll();
  }

  @Patch("users/:id")
  @ApiOperation({ summary: "Update user (admin only)" })
  updateUser(@Param("id") id: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete("users/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete user (admin only)" })
  removeUser(@Param("id") id: string) {
    return this.usersService.remove(id);
  }
}
