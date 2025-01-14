import { HttpClientTestingModule } from '@angular/common/http/testing'
import { async, ComponentFixture, TestBed } from '@angular/core/testing'
import { RouterTestingModule } from '@angular/router/testing'
import { LeafletModule } from '@asymmetrik/ngx-leaflet'
import { BackgroundGeolocation } from '@ionic-native/background-geolocation/ngx'
import { LocalNotifications } from '@ionic-native/local-notifications/ngx'
import { IonicModule } from '@ionic/angular'
import { SqliteService } from '../../shared-services/db/sqlite.service'
import { LocationService } from '../../shared-services/location.service'
import { TrajectoryService } from '../../shared-services/trajectory.service'
import { MapPage } from './map.page'

describe('MapPage', () => {
  let component: MapPage
  let fixture: ComponentFixture<MapPage>

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [MapPage],
      imports: [
        IonicModule,
        RouterTestingModule,
        HttpClientTestingModule,
        LeafletModule,
      ],
      providers: [
        LocationService,
        TrajectoryService,
        BackgroundGeolocation,
        LocalNotifications,
        SqliteService,
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(MapPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  }))

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
