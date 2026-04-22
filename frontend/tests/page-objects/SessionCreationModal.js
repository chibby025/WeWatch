/**
 * Session Creation Modal Page Object
 */

export class SessionCreationModal {
  constructor(page) {
    this.page = page;
    
    // Session type selection
    this.instantWatchButton = page.locator('text=Instant Watch');
    this.scheduledEventButton = page.locator('text=Scheduled Event');
    
    // Class type selection
    this.movieNightButton = page.locator('text=Movie Night');
    this.watchPartyButton = page.locator('text=Watch Party');
    this.classroomButton = page.locator('text=Classroom');
    
    // Classroom types
    this.lectureHallButton = page.locator('text=Lecture Hall');
    this.studyRoomButton = page.locator('text=Study Room');
    
    // Pricing
    this.freeButton = page.locator('text=Free');
    this.paidButton = page.locator('text=Paid');
    this.ticketPriceInput = page.locator('input[name="ticket_price"], input[placeholder*="price"]');
    this.capacityInput = page.locator('input[name="capacity"], input[placeholder*="capacity"]');
    
    // Content rating (G, PG, 13+, 16+, 18+, Mature)
    this.ratingG = page.locator('[alt="G"], button:has-text("G")');
    this.ratingPG = page.locator('[alt="PG"], button:has-text("PG")');
    this.rating13Plus = page.locator('[alt="13+"], button:has-text("13+")');
    this.rating16Plus = page.locator('[alt="16+"], button:has-text("16+")');
    this.rating18Plus = page.locator('[alt="18+"], button:has-text("18+")');
    this.ratingMature = page.locator('[alt="Mature"], button:has-text("Mature")');
    
    // Scheduled event fields
    this.eventDateInput = page.locator('input[type="datetime-local"], input[name="event_date"]');
    
    // Submit
    this.createButton = page.locator('button:has-text("Create Session"), button:has-text("Create Room")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
  }

  async selectInstantWatch() {
    await this.instantWatchButton.click();
  }

  async selectScheduledEvent() {
    await this.scheduledEventButton.click();
  }

  async selectMovieNight() {
    await this.movieNightButton.click();
  }

  async selectWatchParty() {
    await this.watchPartyButton.click();
  }

  async selectClassroom() {
    await this.classroomButton.click();
  }

  async selectLectureHall() {
    await this.lectureHallButton.click();
  }

  async selectFree() {
    await this.freeButton.click();
  }

  async selectPaid(ticketPrice, capacity) {
    await this.paidButton.click();
    if (ticketPrice) await this.ticketPriceInput.fill(ticketPrice.toString());
    if (capacity) await this.capacityInput.fill(capacity.toString());
  }

  async selectRating(rating) {
    const ratingMap = {
      'G': this.ratingG,
      'PG': this.ratingPG,
      '13+': this.rating13Plus,
      '16+': this.rating16Plus,
      '18+': this.rating18Plus,
      'Mature': this.ratingMature,
    };
    
    await ratingMap[rating].click();
  }

  async setEventDate(date) {
    // Format: YYYY-MM-DDTHH:MM
    const formatted = date.toISOString().slice(0, 16);
    await this.eventDateInput.fill(formatted);
  }

  async createSession() {
    await this.createButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }

  // Combined flow for creating a free session
  async createFreeSession(classType = 'Movie Night', rating = 'PG') {
    await this.selectInstantWatch();
    
    if (classType === 'Movie Night') await this.selectMovieNight();
    else if (classType === 'Watch Party') await this.selectWatchParty();
    else if (classType === 'Classroom') await this.selectClassroom();
    
    await this.selectFree();
    await this.selectRating(rating);
    await this.createSession();
  }

  // Combined flow for creating a paid session
  async createPaidSession(classType = 'Watch Party', ticketPrice = 500, capacity = 50, rating = '13+') {
    await this.selectInstantWatch();
    
    if (classType === 'Watch Party') await this.selectWatchParty();
    else if (classType === 'Classroom') await this.selectClassroom();
    
    await this.selectPaid(ticketPrice, capacity);
    await this.selectRating(rating);
    await this.createSession();
  }
}
