import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campus } from '../../entities/campus.entity';
import { School } from '../../entities/school.entity';
import { Program } from '../../entities/program.entity';
import { CreateCampusDto } from './dto/create-campus.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateProgramDto } from './dto/create-program.dto';

@Injectable()
export class IamService {
  constructor(
    @InjectRepository(Campus) private campuses: Repository<Campus>,
    @InjectRepository(School) private schools: Repository<School>,
    @InjectRepository(Program) private programs: Repository<Program>,
  ) {}

  listCampuses() {
    return this.campuses.find({ order: { campus_id: 'ASC' } });
  }

  createCampus(dto: CreateCampusDto) {
    return this.campuses.save(this.campuses.create(dto));
  }

  listSchools() {
    return this.schools.find({ order: { school_id: 'ASC' } });
  }

  createSchool(dto: CreateSchoolDto) {
    return this.schools.save(this.schools.create(dto));
  }

  listPrograms() {
    return this.programs.find({ order: { program_id: 'ASC' } });
  }

  createProgram(dto: CreateProgramDto) {
    return this.programs.save(this.programs.create(dto));
  }
}
