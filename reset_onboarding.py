from database.models import init_db, Settings
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text

engine = create_engine('sqlite:///momai.db')
# Em vez de init_db que pode falhar se já existir, vamos apenas conectar
# init_db(engine) 

with Session(engine) as session:
    try:
        settings = session.query(Settings).first()
        if settings:
            settings.onboarding_completed = False
            settings.tutorial_completed = False
            session.commit()
            print("Settings reset: onboarding_completed=False, tutorial_completed=False")
        else:
            print("No settings found in database.")
    except Exception as e:
        print(f"Error: {e}")
