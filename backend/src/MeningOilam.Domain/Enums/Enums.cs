namespace MeningOilam.Domain.Enums;

// PascalCase members map to snake_case Postgres enum labels via NpgsqlSnakeCaseNameTranslator,
// e.g. AwaitingRelativeChoice -> "awaiting_relative_choice", MediaOnly -> "media_only".

public enum AppRole { Superadmin, Admin, Member }

public enum GenderType { Male, Female }

public enum MemberStatus { Pending, Active, Blocked }

public enum BotIntegrationMode { MediaOnly, DeleteAll, KeepAll }

public enum NotificationType { JoinRequest, ApprovalNeeded, SpamDetected, ErrorReport, System }

public enum RsvpStatus { Yes, No, Maybe }

public enum JoinRequestStatus
{
    AwaitingRelativeChoice,
    AwaitingRelativeConfirm,
    AwaitingAdminApproval,
    Approved,
    Rejected,
    Expired,
}

public enum RelationshipType
{
    Father, Mother, Son, Daughter, Brother, Sister, Husband, Wife,
    UnclePaternal, UncleMaternal, AuntPaternal, AuntMaternal,
    CousinMale, CousinFemale,
    Grandfather, Grandmother, Grandson, Granddaughter,
    FatherInLaw, MotherInLaw, SonInLaw, DaughterInLaw,
    BrotherInLaw, SisterInLaw,
    Nephew, Niece, Other,
    Self, StepFather, StepMother, StepSon, StepDaughter,
    HalfBrother, HalfSister,
    GreatGrandfather, GreatGrandmother, GreatGrandson, GreatGranddaughter,
    Godfather, Godmother, FamilyFriend,
}
