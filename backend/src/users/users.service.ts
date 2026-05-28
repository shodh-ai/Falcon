import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Department } from '../entities/department.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Department)
    private departmentRepository: Repository<Department>,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['role', 'department'],
    });
  }

  async findActiveUsers(): Promise<User[]> {
    return this.userRepository.find({
      where: { is_active: true },
      relations: ['role', 'department'],
    });
  }

  async findUsersByRole(roleName: string): Promise<User[]> {
    const role = await this.roleRepository.findOne({
      where: { role_name: roleName },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleName} not found`);
    }

    return this.userRepository.find({
      where: { role_id: role.role_id, is_active: true },
      relations: ['role', 'department'],
    });
  }

  async findUsersByDepartment(deptId: number): Promise<User[]> {
    return this.userRepository.find({
      where: { dept_id: deptId, is_active: true },
      relations: ['role', 'department'],
    });
  }

  async findOneUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
      relations: ['role', 'department'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user;
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOneUser(userId);
    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async deactivateUser(userId: string): Promise<User> {
    const user = await this.findOneUser(userId);
    user.is_active = false;
    return this.userRepository.save(user);
  }

  async activateUser(userId: string): Promise<User> {
    const user = await this.findOneUser(userId);
    user.is_active = true;
    return this.userRepository.save(user);
  }

  async updateUserRole(userId: string, roleId: number): Promise<User> {
    const user = await this.findOneUser(userId);
    const role = await this.roleRepository.findOne({
      where: { role_id: roleId },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    user.role_id = roleId;
    return this.userRepository.save(user);
  }

  async updateUserDepartment(userId: string, deptId: number): Promise<User> {
    const user = await this.findOneUser(userId);
    const department = await this.departmentRepository.findOne({
      where: { dept_id: deptId },
    });

    if (!department) {
      throw new NotFoundException(`Department with ID ${deptId} not found`);
    }

    user.dept_id = deptId;
    return this.userRepository.save(user);
  }

  async getUserStatistics(): Promise<any> {
    const totalUsers = await this.userRepository.count();
    const activeUsers = await this.userRepository.count({ where: { is_active: true } });
    const inactiveUsers = totalUsers - activeUsers;

    const roles = await this.roleRepository.find();
    const byRole = {};

    for (const role of roles) {
      const count = await this.userRepository.count({
        where: { role_id: role.role_id, is_active: true },
      });
      byRole[role.role_name] = count;
    }

    const departments = await this.departmentRepository.find();
    const byDepartment = {};

    for (const dept of departments) {
      const count = await this.userRepository.count({
        where: { dept_id: dept.dept_id, is_active: true },
      });
      byDepartment[dept.dept_name] = count;
    }

    return {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      byRole,
      byDepartment,
    };
  }
}
